import { useMemo, useState, type KeyboardEvent } from "react";
import type { Campaign, PickKind } from "../../engine/build.js";
import type { BuildResult } from "../../engine/validate.js";
import { TraitCategory } from "../../schema/index.js";
import { traitOptions } from "../check.js";
import { content, traitById } from "../content.js";
import { addPick, type Draft } from "../draft.js";
import { Chip, StepHeader, title, traitName } from "./ui.js";

interface Props {
  draft: Draft;
  campaign: Campaign;
  result: BuildResult;
  onChange: (d: Draft) => void;
}

// Group titles, in the schema's category order.
const GROUP_TITLE: Record<(typeof TraitCategory.options)[number], string> = {
  knowledge: "Knowledges",
  skill: "Skills",
  contact: "Contacts",
  starter: "Starter Traits",
  condition: "Conditions",
  membership: "Memberships",
  circumstance: "Circumstances",
};

const PICK_HELP: Record<PickKind, string> = {
  universal: "Universal picks take any Trait that isn't a Background Trait, knowledge included at creation.",
  background: "Background picks take only Traits on this character's Background Trait list.",
};

export function TraitsStep({ draft, campaign, result, onChange }: Props) {
  const [pick, setPick] = useState<PickKind>("universal");
  const [query, setQuery] = useState("");
  // Categories whose boxes are unchecked; all of them show by default.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hideRejected, setHideRejected] = useState(true);

  const options = useMemo(() => traitOptions(draft, content, campaign, pick), [draft, campaign, pick]);
  const summary = result.summary;

  if (!options || !summary) {
    return (
      <section>
        <StepHeader step="traits" title="Traits" />
        <p className="empty">Finish the Kind and Background steps first; the engine needs a complete build to check picks against.</p>
      </section>
    );
  }

  const q = query.trim().toLowerCase();
  // Taken Traits stay in view even once the engine says they can't be taken again.
  const taken = new Set(draft.traits.map((p) => p.trait));
  const shown = options.filter(
    (o) =>
      !hidden.has(o.trait.category) &&
      (!hideRejected || o.reasons.length === 0 || taken.has(o.trait.id)) &&
      (!q || o.trait.name.toLowerCase().includes(q) || o.trait.tags.some((t) => t.toLowerCase().includes(q))),
  );
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
  const toggle = (id: string, rank: number) => {
    const i = lastPick(id);
    if (i >= 0) remove(i);
    else onChange(addPick(draft, id, rank, pick));
  };

  return (
    <section>
      <StepHeader step="traits" title="Traits">
        Spend picks on Traits. Unspent picks are banked for later.
      </StepHeader>

      <div className="tech-fields tech-fields-light">
        <div className="tech-field-tab-list" role="tablist" aria-label="Pick type">
          {(["universal", "background"] as const).map((k) => {
            const p = summary.picks[k];
            return (
              <button
                key={k}
                role="tab"
                aria-selected={pick === k}
                className={`tech-field-tab${pick === k ? " is-active" : ""}`}
                onClick={() => setPick(k)}
              >
                {title(k)} <span className="num">{p.spent}/{p.available}</span>
              </button>
            );
          })}
        </div>
        <p className="hint">{PICK_HELP[pick]}</p>

        <div className="filters">
          <input type="search" placeholder="Search name or tag" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search Traits" />
          {TraitCategory.options.map((c) => (
            <label key={c} className="check">
              <input type="checkbox" checked={!hidden.has(c)} onChange={() => toggleCategory(c)} /> {GROUP_TITLE[c]}
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={hideRejected} onChange={(e) => setHideRejected(e.target.checked)} /> Hide unavailable
          </label>
        </div>

        {options.length === 0 && pick === "background" && (
          <p className="empty">This character's Background Trait list is empty. It grows from package background Traits and the Kind's Trait access.</p>
        )}
        {options.length > 0 && shown.length === 0 && (
          <p className="empty">{hideRejected ? "No available Traits match. Turn off Hide unavailable to see why the rest are out." : "No Traits match."}</p>
        )}

        {groups.map((g) => (
          <div key={g.category} className="trait-group">
            <h3 className="subhead">{GROUP_TITLE[g.category]}</h3>
            <ul className="trait-list">
              {g.options.map(({ trait: t, rank, reasons }) => {
                const selected = lastPick(t.id) >= 0;
                const rejected = !selected && reasons.length > 0;
                const onKey = (e: KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!rejected) toggle(t.id, rank);
                  }
                };
                return (
                  <li
                    key={t.id}
                    role="checkbox"
                    aria-checked={selected}
                    aria-disabled={rejected}
                    aria-label={selected ? `${t.name}, taken` : `Take ${t.name}${t.ranked || rank > 1 ? ` rank ${rank}` : ""} with a ${pick} pick`}
                    tabIndex={0}
                    className={`trait trait-box${selected ? " selected" : ""}${rejected ? " rejected" : ""}`}
                    onClick={() => !rejected && toggle(t.id, rank)}
                    onKeyDown={onKey}
                  >
                    <h3 className="trait-name">{t.name}</h3>
                    <div className="trait-main">
                      <div className="chips">
                        <Chip>{title(t.category)}</Chip>
                        {t.ranked && <Chip tone="muted">Ranked</Chip>}
                        {t.background && <Chip tone="muted">Background</Chip>}
                      </div>
                      <p>{t.summary}</p>
                      <p className="effect">{t.effect}</p>
                      {t.tags.length > 0 && <p className="tags">{t.tags.map((tag) => `#${tag}`).join(" ")}</p>}
                      {selected && t.ranked && (
                        // The card's own click and keys toggle it, so the stepper keeps its events to itself.
                        <div className="rank-step" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <span className="rank-label">Rank</span>
                          <button type="button" aria-label={`Drop a rank of ${t.name}`} onClick={() => remove(lastPick(t.id))}>
                            −
                          </button>
                          <span className="num">{heldRank.get(t.id) ?? 0}</span>
                          <button
                            type="button"
                            disabled={reasons.length > 0}
                            title={reasons.join(" ") || undefined}
                            aria-label={`Take ${t.name} rank ${rank} with a ${pick} pick`}
                            onClick={() => onChange(addPick(draft, t.id, rank, pick))}
                          >
                            +
                          </button>
                        </div>
                      )}
                      {rejected && (
                        <ul className="reasons">
                          {reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <h3 className="subhead">Picks spent</h3>
        {draft.traits.length === 0 ? (
          <p className="empty">No picks spent yet.</p>
        ) : (
          <ul className="picks">
            {draft.traits.map((p, i) => (
              <li key={i}>
                <span>
                  <strong>{traitName(p.trait)}</strong> rank {p.rank ?? 1} <span className="muted">· {p.pick} pick</span>
                  {!traitById.has(p.trait) && <Chip tone="bad">unknown</Chip>}
                </span>
                <button className="link" onClick={() => remove(i)} aria-label={`Remove ${traitName(p.trait)} rank ${p.rank ?? 1}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
