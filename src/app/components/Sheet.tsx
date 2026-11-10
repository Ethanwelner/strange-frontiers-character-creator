import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FREE_TEXT_POOLS, isFreeTextPool, MP_PER_MAGIC, type BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { coreStatsShown } from "../check.js";
import { sheetStatGroups, StatBlock } from "./stats.js";
import { content, kindById, packageById, traitById } from "../content.js";
import type { Draft, Looks } from "../draft.js";
import type { Item } from "../items.js";
import type { HeldCondition } from "../conditions.js";
import { CharacterLine } from "./CharacterLine.js";
import { Conditions } from "./Conditions.js";
import { Items } from "./Items.js";
import { askerName, baseStats, DescriptionBox, Effect, Icon, LorePopup, NameField, Portrait, StepHeader, title, TraitAction, traitName } from "./ui.js";
import { CardChip, TraitCard, traitCardKind } from "./cards.js";
import { Button } from "./Button.js";

// Each resource's full name, shown on hover, as in Player Tools
export const RESOURCE_NAMES = { hp: "Hit Points", vp: "Vibe Points", sp: "Savvy Points", mp: "Mana Points" } as const;

const SOURCE = /^(kind|origin|profession|past) ([a-z0-9-]+)( choice)?$/;
const TRAIT_CHOICE = /^trait ([a-z0-9-]+) choice$/;
const TRAIT_GRANT = /^trait ([a-z0-9-]+)$/;

// "origin dreft" → "Dreft (origin)", "kind isek" → "Isek (kind)",
// "trait additional-language choice" →
// "Additional Language (choice)"; pick sources read as they are.
function source(s: string) {
  const t = TRAIT_CHOICE.exec(s);
  if (t) return `${traitName(t[1]!)} (choice)`;
  // Conveyed by another Trait, like Magic Access by Magical Heritage
  const g = TRAIT_GRANT.exec(s);
  if (g) return traitName(g[1]!);
  const m = SOURCE.exec(s);
  if (!m) return s;
  const name = m[1] === "kind" ? kindById.get(m[2]!)?.name : packageById.get(m[2]!)?.name;
  return `${name ?? m[2]} (${m[1]}${m[3] ?? ""})`;
}

type Held = NonNullable<BuildResult["summary"]>["traits"][number];

// Where a held Trait came from, as badges: Origin, Profession or Past for a
// Trait selected from that package's choices in the Background step. A
// package's grants (a Knight's Wielder: Longsword) come with it rather than
// being selected, and a Trait bought with a pick isn't one, even from a
// package's Background list, so neither gets a badge; nor does the Kind's.
function sourceBadges(held: Held): string[] {
  const slots = new Set<string>();
  for (const s of held.sources) {
    const m = SOURCE.exec(s);
    if (m && m[1] !== "kind" && m[3]) slots.add(m[1]!);
  }
  return ["origin", "profession", "past"].filter((slot) => slots.has(slot)).map(title);
}

// A held Trait's card, with the badges for where it came from (a package's
// choice) at the right of the name's bar. Its category sits in its body, as
// a badge over the effect: the sheet's sections already sort the cards by it.
// `onToggle` makes it fold, a chevron at the end of the name's bar opening
// the body or closing the card back to that bar.
function HeldTraitCard({
  held,
  places,
  open = true,
  onToggle,
  keepEffect = false,
}: {
  held: Held;
  places: string[];
  draft?: Draft;
  open?: boolean;
  onToggle?: () => void;
  // An Ability's effect stays in view while closed; only its badge, where it
  // came from and the Action it grants fold away.
  keepEffect?: boolean;
}) {
  const t = traitById.get(held.trait);
  const name = traitName(held.trait);
  const badges = sourceBadges(held);
  const effect = t && <Effect text={t.effect} />;
  return (
    <TraitCard
      kind={traitCardKind(t)}
      name={name}
      rank={t?.ranked || held.rank > 1 ? held.rank : undefined}
      plane={t?.plane}
      chips={badges.length > 0 ? badges.map((b) => <CardChip key={b}>{b}</CardChip>) : undefined}
      fold={onToggle ? { open, onToggle, label: name } : undefined}
      keep={keepEffect ? effect : undefined}
    >
      {/* The category, then where the Trait came from, on one line */}
      <div className="sf-card-tags">
        {t ? <CardChip>{title(t.category)}</CardChip> : <CardChip tone="bad">not in content yet</CardChip>}
        <span className="sf-card-note">From {held.sources.map(source).join(", ")}</span>
      </div>
      {!keepEffect && effect}
      <TraitAction action={t?.action} rank={held.rank} />
      {places.length > 0 && (
        <p className="small">
          <strong>{t?.choices.find((c) => c.from !== "contact" && isFreeTextPool(c.from))?.note ?? "Place"}:</strong> {places.join(", ")}
        </p>
      )}
    </TraitCard>
  );
}

// A Knowledge's card, opened from the sheet's list in the site's lore popup.
function TraitModal({ held, places, draft, onClose }: { held: Held; places: string[]; draft: Draft; onClose: () => void }) {
  return (
    <LorePopup label={traitName(held.trait)} onClose={onClose} className="lore-modal-card">
      <HeldTraitCard held={held} places={places} draft={draft} />
    </LorePopup>
  );
}

// The Conditions' and Items' boxes, straight into the stats' row, or, with a
// box to go over them (`stack`), in a column with it beside the stats. The
// box (`top`) leaves the column for the top of the row when the row is a
// single column.
function MaybeStack({ stack, top, children }: { stack: boolean; top?: ReactNode; children: ReactNode }) {
  if (!stack) return <>{children}</>;
  return (
    <div className="sheet-side-stack">
      {top}
      <div className="sheet-side-row">{children}</div>
    </div>
  );
}

// Movement, from the Kind, in a small box of its own to the left of the
// resistances, under its ruled title, a running figure before the number.
// The number runs into its unit, "10m", with the m in the titles' Bebas.
export function MovementBox({ movement }: { movement?: string }) {
  const parts = movement?.match(/^\s*([\d.]+)\s*([a-z]+)\s*$/i);
  return (
    <div className="c-sheet-box sheet-movement">
      <h3 className="subhead" title="Movement">Move</h3>
      <div className="sheet-movement-value" title="Movement">
      <Icon name="person-running" label="Movement" />
      <span className="num">
        {parts ? (
          <>
            {parts[1]}
            <span className="sheet-movement-unit">{parts[2]}</span>
          </>
        ) : (
          (movement ?? "–")
        )}
      </span>
      </div>
    </div>
  );
}

// Laid out like the sample character sheet on the site's Mechanics tab.
// Knowledges and Languages are a list of links, as on that sheet, each opening
// its card; the other Traits are cards.
//
// Game Tools shows it `embedded` under its tracker, which already has the
// name, level, background, the Kind's features, resources and the actions:
// there the sheet keeps only the stats, Knowledges and Traits.
export function Sheet({
  draft,
  result,
  onExport,
  onImport,
  onName,
  onLooks,
  onPortrait,
  onDescription,
  embedded = false,
  statsSlot,
  resistancesSlot,
  traitsAction,
  items,
  onItems,
  conditions,
  onConditions,
  hp,
}: {
  draft: Draft;
  result: BuildResult;
  onExport?: () => void;
  onImport?: () => void;
  onName?: (name?: string) => void;
  embedded?: boolean;
  // Stands in for the stats column, as Player Tools' stats editor does
  statsSlot?: ReactNode;
  // A box over the Conditions and Items, beside the stats, like Player Tools' resistances
  resistancesSlot?: ReactNode;
  // Shown at the right end of the Traits title's line, like Player Tools' "Traits available"
  traitsAction?: ReactNode;
  onLooks?: (looks: Looks) => void;
  // Changes the portrait from the sheet; without it the sheet only shows it.
  onPortrait?: (portrait?: string) => void;
  // Edits the description; without it the sheet shows the description as text.
  onDescription?: (description?: string) => void;
  // The Conditions, beside the stats, and the Items, in the last column,
  // with the current HP the Conditions go by (full if not given)
  items?: Item[];
  onItems?: (items: Item[]) => void;
  conditions?: HeldCondition[];
  onConditions?: (conditions: HeldCondition[]) => void;
  hp?: number;
}) {
  const packages = [draft.origin, draft.profession, draft.past].map((id) => (id ? packageById.get(id) : undefined));
  const base = baseStats(draft);
  const summary = result.summary;
  const groups = coreStatsShown(draft, content, result);
  // MP shows once the character can level Magic or has any.
  const resources = groups.includes("magic") || (summary?.resources.mp ?? 0) > 0 ? (["hp", "vp", "sp", "mp"] as const) : (["hp", "vp", "sp"] as const);
  // Contacts, as the player wrote them.
  const records = draft.choices.flatMap((c) =>
    c.from === "contact" ? c.traits.map((text) => ({ text, noun: FREE_TEXT_POOLS[c.from]!, from: askerName(c) })) : [],
  );
  // Places and the like go on their Trait's box, like "Which seas: the Mende
  // coast" or a Hunter's quarry. Contacts get their own list.
  const places = (trait: string) => draft.choices.filter((c) => c.trait === trait && c.from !== "contact" && isFreeTextPool(c.from)).flatMap((c) => c.traits);
  const held = summary?.traits ?? [];
  const isKnowledge = (h: Held) => traitById.get(h.trait)?.category === "knowledge";
  const isLanguage = (h: Held) => !!traitById.get(h.trait)?.types.includes("language");
  // Knowledges, then Languages, as on the sample sheet
  const knowledges = [...held.filter((h) => isKnowledge(h) && !isLanguage(h)), ...held.filter(isLanguage)];
  const others = held.filter((h) => !isKnowledge(h));
  // The other Traits in a box per category: Skills, then Abilities, then any
  // left over (Circumstances and the like) in a box of their own
  const categoryOf = (h: Held) => traitById.get(h.trait)?.category;
  const skills = others.filter((h) => categoryOf(h) === "skill");
  const abilities = others.filter((h) => categoryOf(h) === "ability");
  const rest = others.filter((h) => categoryOf(h) !== "skill" && categoryOf(h) !== "ability");
  // Skills and Abilities open from their chevrons, like the item cards.
  // Closed, a Skill shows its name's bar alone and an Ability its name and
  // effect; open, both add the badge, where it came from and any Action.
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const toggleCard = (id: string) => {
    const next = new Set(openCards);
    if (!next.delete(id)) next.add(id);
    setOpenCards(next);
  };
  // The universal and background picks left, together
  const banked = summary ? summary.picks.universal.banked + summary.picks.background.banked : 0;
  const traitCards = (list: Held[], accordion = false, keepEffect = false) => (
    <ul className="sheet-traits">
      {list.map((h) => (
        <li key={h.trait}>
          <HeldTraitCard
            held={h}
            places={places(h.trait)}
            {...(accordion ? { open: openCards.has(h.trait), onToggle: () => toggleCard(h.trait) } : {})}
            keepEffect={keepEffect}
          />
        </li>
      ))}
    </ul>
  );
  const [open, setOpen] = useState<string>();
  const closeModal = useCallback(() => setOpen(undefined), []);
  // Whether the Conditions and Items have wrapped under the stats, leaving a
  // single column: then the resistances go first, under HP and over the stats.
  // Moving them doesn't change where the row wraps, so this settles.
  const row = useRef<HTMLDivElement>(null);
  const [singleColumn, setSingleColumn] = useState(false);
  const hasResistances = Boolean(resistancesSlot);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el || !hasResistances) return;
    const check = () => {
      const stats = el.querySelector(":scope > .sheet-body");
      const side = el.querySelector(":scope > .sheet-side-stack");
      if (stats && side) setSingleColumn(side.getBoundingClientRect().top > stats.getBoundingClientRect().top + 1);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasResistances]);
  // Movement's small box, then the resistances', on one line
  const resistancesBox = resistancesSlot && (
    <div className="sheet-move-row">
      <MovementBox movement={summary?.movement} />
      <div className="c-sheet-box sheet-resistances">{resistancesSlot}</div>
    </div>
  );
  const opened = held.find((h) => h.trait === open);
  // The Kind's features sit at the top, under HP, VP and SP; the packages' at the bottom.
  const features = [
    ...packages.flatMap((p) => (p?.features ?? []).map((f) => ({ ...f, from: p!.name }))),
  ];

  return (
    <section className={`sheet${embedded ? " sheet-embedded" : ""}`}>
      {!embedded && (
        <>
          <StepHeader title="Sheet" />
          {/* Whether the build is legal, then Download, Import and Print, above the sheet */}
          <div className="sheet-actions">
            <span className={`status ${result.ok ? "good" : "bad"}`}>{result.ok ? "Legal" : `${result.errors.length} ${result.errors.length === 1 ? "error" : "errors"}`}</span>
            <Button onClick={onExport}>
              <Icon name="download" />
              Download
            </Button>
            <Button onClick={onImport}>
              <Icon name="upload" />
              Import
            </Button>
            <Button onClick={() => window.print()}>
              <Icon name="print" />
              Print
            </Button>
          </div>
        </>
      )}
      <div className="c-sheet">
        {!embedded && (
          <div className="level-badge level-blob" aria-label={`Level ${draft.level}`}>
            <span className="level-badge-label">Level</span>
            <span className="level-badge-number">{draft.level}</span>
          </div>
        )}

        {!embedded && (
          <div className="c-sheet-box sheet-head">
            {/* The portrait and the name's column, together as wide as the sheet's first two columns */}
            <div className="sheet-head-who">
              <Portrait className="sheet-portrait" portrait={draft.portrait} name={draft.name} onChange={onPortrait} />
              <div className="sheet-head-main">
                <NameField className="sheet-name" heading="h2" name={draft.name} onChange={onName ?? (() => {})} />
                {/* Kind, age, gender, height, weight, Origin, Profession and Past, as in Player Tools */}
                <CharacterLine draft={draft} onLooks={onLooks ?? (() => {})} />
              </div>
            </div>
            {/* The description, editable at any time and lined up over the Conditions and Items; an AI build fills it with its summary */}
            <DescriptionBox description={draft.description} onChange={onDescription} />
          </div>
        )}

        {/* HP, VP, SP and MP at full, like Player Tools' tracker without its controls or bars */}
        {!embedded && (
          <div className="c-sheet-box">
            <div className="tools-resources sheet-resources">
              {resources.map((r) => (
                <div key={r} className="tools-resource">
                  <div className="tools-resource-value">
                    <strong className={`tools-resource-name resource-${r}`} title={RESOURCE_NAMES[r]}>
                      {r.toUpperCase()}
                    </strong>
                    <span className="num">
                      {summary?.resources[r] ?? "–"}
                      <span className="muted"> / {summary?.resources[r] ?? "–"}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The stats, the Conditions and the Items, each in a box of its own */}
        <div className="sheet-row" ref={row}>
          {singleColumn && resistancesBox}
          <div className="c-sheet-box sheet-body">
            {statsSlot ? (
              <div className="sheet-stats">{statsSlot}</div>
            ) : (
              <div className="sheet-stats">
                {/* The stat block with each stat's maximum */}
                <StatBlock max groups={sheetStatGroups(draft, result)} />
              </div>
            )}
          </div>
          {onItems && onConditions && (
            // The Conditions and the Items, each in its own box along the row;
            // with resistances, under them, together beside the stats
            <MaybeStack stack={hasResistances} top={!singleColumn && resistancesBox}>
              <div className="c-sheet-box sheet-conditions">
                <Conditions conditions={conditions ?? []} hp={hp ?? summary?.resources.hp ?? 0} maxHp={summary?.resources.hp ?? 0} onChange={onConditions} />
              </div>
              <div className="c-sheet-box sheet-items">
                <Items items={items ?? []} onChange={onItems} />
              </div>
            </MaybeStack>
          )}
        </div>

        {/* The Knowledges in their own box, first along the row */}
        <div className="sheet-lower">
          <div className="c-sheet-box sheet-side">
            <h3 className="subhead">Knowledges</h3>
            {knowledges.length > 0 ? (
              <ul className="knowledge-list">
                {knowledges.map((h) => {
                  const t = traitById.get(h.trait);
                  return (
                    <li key={h.trait}>
                      {isLanguage(h) ? <Icon name="language" label="Language" /> : <Icon name="knowledge" label="Knowledge" />}
                      <Button kind="link" onClick={() => setOpen(h.trait)}>
                        {traitName(h.trait)}
                        {t?.ranked || h.rank > 1 ? ` (${h.rank})` : ""}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty">None yet.</p>
            )}
          </div>
          {/* Then the Abilities, the Skills, and any other Traits, each in a box along the row */}
          {/* The Abilities and the Skills share a row of their own, split equally */}
          <div className="sheet-pair">
            <div className="c-sheet-box sheet-abilities">
              <h3 className="subhead">Abilities</h3>
              {abilities.length > 0 ? traitCards(abilities, true, true) : <p className="empty">No Abilities yet.</p>}
            </div>
            <div className="c-sheet-box sheet-skills">
              {/* The Skills title, then along its line the picks the character
                  still has to spend on Traits, then the action, if any */}
              <div className="sheet-traits-head">
                <h3 className="subhead">Skills</h3>
                {summary && (
                  <span className="sheet-banked">
                    {banked} {banked === 1 ? "pick" : "picks"} available
                  </span>
                )}
                {traitsAction}
              </div>
              {skills.length > 0 ? traitCards(skills, true) : <p className="empty">No Skills yet.</p>}
            </div>
          </div>
          {(rest.length > 0 || records.length > 0 || features.length > 0) && (
            <div className="c-sheet-box sheet-other">
              {rest.length > 0 && (
                <>
                  <h3 className="subhead">Other Traits</h3>
                  {traitCards(rest)}
                </>
              )}
              {records.length > 0 && (
                <>
                  <h3 className="subhead">Contacts</h3>
                  <ul className="features">
                    {records.map((r, i) => (
                      <li key={i}>
                        <strong>{r.text}</strong> <span className="muted">({r.noun} from {r.from})</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {features.length > 0 && (
                <>
                  <h3 className="subhead">Features</h3>
                  <ul className="features">
                    {features.map((f, i) => (
                      <li key={i}>
                        <strong>{f.name}</strong> <span className="muted">({f.from})</span>. {f.description}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {opened && <TraitModal held={opened} places={places(opened.trait)} draft={draft} onClose={closeModal} />}
    </section>
  );
}
