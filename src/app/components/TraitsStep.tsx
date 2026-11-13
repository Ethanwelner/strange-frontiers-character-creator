import { Fragment, useMemo, useState, type KeyboardEvent } from "react";
import type { Campaign, PickKind } from "../../engine/build.js";
import type { BuildResult } from "../../engine/validate.js";
import { TraitCategory, type Trait } from "../../schema/index.js";
import { traitOptions, type TraitTab } from "../check.js";
import { content, traitById } from "../content.js";
import { addPick, type Draft } from "../draft.js";
import { Chip, Effect, Sign, StepHeader, title, TraitAction, traitName } from "./ui.js";
import { CardChip, CardNote, KIND_ICON, TraitCard, traitCardKind } from "./cards.js";
import { Button, RemoveX } from "./Button.js";

interface Props {
  draft: Draft;
  campaign: Campaign;
  result: BuildResult;
  onChange: (d: Draft) => void;
  // Traits to leave out of the lists, like the ones a character in Game
  // Tools already had before this round of picks.
  hide?: ReadonlySet<string>;
  // Picks from this index on are this round's (Game Tools' popup): only
  // those are listed, as "Traits selected", and only they can be removed.
  newFrom?: number;
  // The Traits picked go under the tab box instead of at the end of it, so
  // they stay in view (Player Tools' Choose Traits popup)
  picksBelow?: boolean;
  // The help: that unspent picks are banked, and under the tabs what each
  // tab's picks are for (the creator's step); Player Tools' popup goes without
  hints?: boolean;
  // Trait categories left out entirely, with no checkbox, like Player Tools'
  // Conditions, which have their own Add a Condition
  skip?: ReadonlySet<string>;
}

// What a Trait needs before it can be picked, as the site writes it:
// "(Power 3) (Endurance 2) (Capable Student) (any Pilot Trait)": each
// requirement in its own parens, a stat the character falls short of in red.
function Requirements({ trait: t, short }: { trait: Trait; short: string[] }) {
  const items = [
    ...Object.entries(t.minStats).map(([s, n]) => ({ text: `${title(s)} ${n}`, unmet: short.includes(s) })),
    ...t.prerequisites.map((id) => ({ text: traitName(id), unmet: false })),
    ...t.prerequisiteTags.map((tag) => ({ text: `any ${title(tag)} Trait`, unmet: false })),
    ...(t.rpRequirement ? [{ text: t.rpRequirement, unmet: false }] : []),
  ];
  if (!items.length) return null;
  return (
    <CardNote>
      {items.map((r, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          {r.unmet ? (
            <span className="unmet" title="Not met yet">
              ({r.text})
            </span>
          ) : (
            `(${r.text})`
          )}
        </Fragment>
      ))}
    </CardNote>
  );
}

// Group titles, in the schema's category order.
const GROUP_TITLE: Record<(typeof TraitCategory.options)[number], string> = {
  knowledge: "Knowledges",
  language: "Languages",
  skill: "Skills",
  starter: "Starter Traits",
  ability: "Abilities",
  condition: "Conditions",
  membership: "Memberships",
  circumstance: "Circumstances",
  other: "Other",
};

const PICK_HELP: Record<PickKind, string> = {
  universal: "Universal picks take any Trait that isn't a Background Trait, knowledge included at creation.",
  background: "Background picks take only Traits sharing a Background Keyword with this character's Origin, Profession or Past.",
};

// A Trait list's own help line, when it isn't built on a special stat like Magic.
const LIST_HELP: Record<string, string> = {
  wielder: "Wielder Skills, one per weapon. They're ordinary Skills, kept on their own tab so they don't crowd the rest.",
};

export function TraitsStep({ draft, campaign, result, onChange, hide, newFrom, picksBelow = false, hints = true, skip }: Props) {
  // A pick type, or a Trait list, like Magic
  const [chosen, setTab] = useState<TraitTab>("universal");
  const [query, setQuery] = useState("");
  // Categories whose boxes are unchecked; all of them show by default.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hideRejected, setHideRejected] = useState(true);

  const summary = result.summary;
  const lists = summary?.traitLists ?? [];
  // A list's tab goes back to Universal if the game no longer has that list.
  const tab: TraitTab = typeof chosen === "string" || lists.includes(chosen.list) ? chosen : "universal";
  const tabKey = typeof tab === "string" ? tab : `list:${tab.list}`;
  const options = useMemo(() => traitOptions(draft, content, campaign, tab), [draft, campaign, tabKey]);

  if (!options || !summary) {
    return (
      <section>
        <StepHeader title="Traits" />
        <p className="empty">Finish the Kind and Background steps first; the engine needs a complete build to check picks against.</p>
      </section>
    );
  }

  const q = query.trim().toLowerCase();
  // Taken Traits stay in view even once the engine says they can't be taken again.
  const taken = new Set(draft.traits.map((p) => p.trait));
  const shown = options.filter(
    (o) =>
      !hide?.has(o.trait.id) &&
      !skip?.has(o.trait.category) &&
      !hidden.has(o.trait.category) &&
      (!hideRejected || (o.reasons.length === 0 && o.shortStats.length === 0) || taken.has(o.trait.id)) &&
      (!q || o.trait.name.toLowerCase().includes(q) || o.trait.tags.some((t) => t.toLowerCase().includes(q))),
  );
  // Only categories this tab has Traits in get a checkbox (no Starter Traits
  // while the game has none)
  const present = new Set(options.filter((o) => !hide?.has(o.trait.id) && !skip?.has(o.trait.category)).map((o) => o.trait.category));
  const groups = TraitCategory.options
    .map((c) => ({ category: c, options: shown.filter((o) => o.trait.category === c) }))
    .filter((g) => g.options.length > 0);
  const toggleCategory = (c: string) => {
    const next = new Set(hidden);
    if (!next.delete(c)) next.add(c);
    setHidden(next);
  };
  const remove = (index: number) => onChange({ ...draft, traits: draft.traits.filter((_, i) => i !== index) });
  // A card is checked once a pick holds its Trait; clicking it again drops the latest of those picks.
  const lastPick = (id: string) => draft.traits.map((p) => p.trait).lastIndexOf(id);
  const heldRank = new Map(summary.traits.map((h) => [h.trait, h.rank]));
  const toggle = (id: string, rank: number, pick: PickKind) => {
    const i = lastPick(id);
    if (i >= 0) remove(i);
    else onChange(addPick(draft, id, rank, pick));
  };

  // The Traits picked here, with Remove: in the tab box under the Traits, or
  // with picksBelow under the box, held over the popup's foot
  const picks = (
    <>
      <h3 className="subhead">{newFrom === undefined ? "Picks spent" : "Traits selected"}</h3>
      {draft.traits.length <= (newFrom ?? 0) ? (
        <p className="empty">{newFrom === undefined ? "No picks spent yet." : "No Traits selected yet."}</p>
      ) : picksBelow ? (
        // In the popup: each Trait's name (and Rank above 1), then its X, in a row
        <ul className="picks picks-row">
          {draft.traits.map((p, i) =>
            i < (newFrom ?? 0) ? null : (
              <li key={i}>
                <strong>
                  {traitName(p.trait)}
                  {(p.rank ?? 1) > 1 ? ` (${p.rank})` : ""}
                </strong>
                {!traitById.has(p.trait) && <Chip tone="bad">unknown</Chip>}
                <RemoveX label={`Remove ${traitName(p.trait)}`} onClick={() => remove(i)} />
              </li>
            ),
          )}
        </ul>
      ) : (
        <ul className="picks">
          {draft.traits.map((p, i) => i < (newFrom ?? 0) ? null : (
            <li key={i}>
              <span>
                <strong>{traitName(p.trait)}</strong> rank {p.rank ?? 1} <span className="muted">· {p.pick} pick</span>
                {!traitById.has(p.trait) && <Chip tone="bad">unknown</Chip>}
              </span>
              <Button kind="link" onClick={() => remove(i)} aria-label={`Remove ${traitName(p.trait)} rank ${p.rank ?? 1}`}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  // In Player Tools' Choose Traits popup (its scroll inner), the tabs, hint
  // and search stay put and only the Traits scroll (.picker-scroll), with the
  // Traits picked under the box
  return (
    <section className="sf-popup-grow">
      <StepHeader title="Traits">
        {hints && "Unspent picks are banked for later."}
      </StepHeader>

      <div className="tech-fields tech-fields-light picker-box">
        <div className="tech-field-tab-list" role="tablist" aria-label="Pick type">
          {(["universal", "background"] as const).map((k) => {
            const p = summary.picks[k];
            return (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                className={`tech-field-tab${tab === k ? " is-active" : ""}`}
                onClick={() => setTab(k)}
              >
                {title(k)} <span className="num">{p.spent}/{p.available}</span>
              </button>
            );
          })}
          {/* One tab per Trait list, like Magic, with how many of its Traits are taken */}
          {lists.map((l) => {
            const active = typeof tab !== "string" && tab.list === l;
            const takenHere = new Set(draft.traits.filter((p) => traitById.get(p.trait)?.list === l).map((p) => p.trait)).size;
            return (
              <button key={l} role="tab" aria-selected={active} className={`tech-field-tab${active ? " is-active" : ""}`} onClick={() => setTab({ list: l })}>
                {title(l)} <span className="num">{takenHere}</span>
              </button>
            );
          })}
        </div>
        {hints && (
          <p className="hint">
            {typeof tab === "string"
              ? PICK_HELP[tab]
              : (LIST_HELP[tab.list] ??
                  `Traits built on ${title(tab.list)}, or closely related to it. Any character can take one whose stat requirements they meet.`) +
                " Traits on this character's Background Trait list take a Background pick while one is left; the rest take Universal picks."}
          </p>
        )}

        <div className="filters traits-filters">
          <input type="search" placeholder="Search name or tag" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search Traits" />
          {TraitCategory.options.filter((c) => present.has(c)).map((c) => (
            <label key={c} className="check">
              <input type="checkbox" checked={!hidden.has(c)} onChange={() => toggleCategory(c)} /> {GROUP_TITLE[c]}
            </label>
          ))}
          <label className="check hide-unavailable">
            <input type="checkbox" checked={hideRejected} onChange={(e) => setHideRejected(e.target.checked)} /> Hide unavailable
          </label>
        </div>

        <div className="picker-scroll">
          {options.length === 0 && tab === "background" && (
            <p className="empty">This character's Background Trait list is empty. It grows from the packages' Background Keywords and the Kind's Trait access.</p>
          )}
          {options.length > 0 && shown.length === 0 && (
            <p className="empty">{hideRejected ? "No available Traits match. Turn off Hide unavailable to see why the rest are out." : "No Traits match."}</p>
          )}

          {groups.map((g) => (
            <div key={g.category} className="trait-group">
              <h3 className="subhead">{GROUP_TITLE[g.category]}</h3>
              <ul className="trait-list">
                {g.options.map(({ trait: t, rank, pick, reasons, shortStats }) => {
                  const selected = lastPick(t.id) >= 0;
                  const blocked = reasons.length > 0 || shortStats.length > 0;
                  const rejected = !selected && blocked;
                  const onKey = (e: KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (!rejected) toggle(t.id, rank, pick);
                    }
                  };
                  return (
                    <TraitCard
                      key={t.id}
                      as="li"
                      kind={traitCardKind(t)}
                      name={t.name}
                      plane={t.plane}
                      className={`trait${selected ? " selected" : ""}${rejected ? " rejected" : ""}`}
                      rootProps={{
                        role: "checkbox",
                        "aria-checked": selected,
                        "aria-disabled": rejected,
                        "aria-label": selected ? `${t.name}, taken` : `Take ${t.name}${t.ranked || rank > 1 ? ` rank ${rank}` : ""} with a ${pick} pick`,
                        tabIndex: 0,
                        onClick: () => !rejected && toggle(t.id, rank, pick),
                        onKeyDown: onKey,
                      }}
                    >
                      {(!KIND_ICON[traitCardKind(t)] || t.ranked || t.background || t.mastery) && (
                        // A Knowledge or Language says so with the icon in its bar
                        <div className="sf-card-tags">
                          {!KIND_ICON[traitCardKind(t)] && <CardChip>{title(t.category)}</CardChip>}
                          {t.ranked && <CardChip tone="muted">Ranked</CardChip>}
                          {t.background && <CardChip tone="muted">Background</CardChip>}
                          {t.mastery && <CardChip tone="muted">Mastery</CardChip>}
                        </div>
                      )}
                      <Requirements trait={t} short={shortStats} />
                      <p>{t.summary}</p>
                      <Effect text={t.effect} />
                      <TraitAction action={t.action} />
                      {selected && t.ranked && (
                        // The card's own click and keys toggle it, so the stepper keeps its events to itself.
                        <div className="rank-step" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <span className="rank-label">Rank</span>
                          <Button round="xs" aria-label={`Drop a rank of ${t.name}`} onClick={() => remove(lastPick(t.id))}>
                            <Sign is="minus" />
                          </Button>
                          <span className="num">{heldRank.get(t.id) ?? 0}</span>
                          <Button
                            round="xs"
                            disabled={blocked}
                            title={reasons.join(" ") || undefined}
                            aria-label={`Take ${t.name} rank ${rank} with a ${pick} pick`}
                            onClick={() => onChange(addPick(draft, t.id, rank, pick))}
                          >
                            <Sign is="plus" />
                          </Button>
                        </div>
                      )}
                      {rejected && reasons.length > 0 && (
                        <ul className="reasons">
                          {reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </TraitCard>
                  );
                })}
              </ul>
            </div>
          ))}

          {!picksBelow && picks}
        </div>
      </div>
      {picksBelow && <div className="traits-picked">{picks}</div>}
    </section>
  );
}
