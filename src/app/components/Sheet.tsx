import { useCallback, useState, type ReactNode } from "react";
import { FREE_TEXT_POOLS, MP_PER_MAGIC, type BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { coreStatsShown } from "../check.js";
import { content, kindById, packageById, traitById } from "../content.js";
import type { Draft } from "../draft.js";
import type { Item } from "../items.js";
import type { HeldCondition } from "../conditions.js";
import { CharacterLine } from "./CharacterLine.js";
import { Conditions } from "./Conditions.js";
import { Items } from "./Items.js";
import { askerName, baseStats, Chip, CoreLine, DescriptionBox, Icon, LorePopup, NameField, Portrait, SettingIcon, StatLine, StepHeader, title, traitName, traitRegionClass } from "./ui.js";

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

// Where a held Trait came from, as badges: Kind for a Trait the Kind gives,
// and Origin, Profession or Past for a Background Trait picked from that
// package's list. A package's own grants (a Farmer's Teamster) get none.
const PACKAGE_SLOTS = ["origin", "profession", "past"] as const;
function sourceBadges(held: Held, draft: Draft): string[] {
  const badges = held.sources.some((s) => SOURCE.exec(s)?.[1] === "kind") ? ["Kind"] : [];
  if (held.sources.includes("background pick")) {
    for (const slot of PACKAGE_SLOTS) {
      if (packageById.get(draft[slot] ?? "")?.backgroundTraits.includes(held.trait)) badges.push(title(slot));
    }
  }
  return badges;
}

// A held Trait, drawn like the site's Traits page cards (.trait-box), with
// badges at the right of the name's bar: where it came from (Kind, or the
// package of a Background Trait pick), then its category
function TraitCard({ held, places, draft }: { held: Held; places: string[]; draft: Draft }) {
  const t = traitById.get(held.trait);
  return (
    <div className={`trait-box ${traitRegionClass(held.trait)}`}>
      <div className="trait-name trait-name-with-chip">
        <span>
          <SettingIcon plane={t?.plane} />
          {traitName(held.trait)}
          {t?.ranked || held.rank > 1 ? ` (${held.rank})` : ""}
        </span>
        <span className="trait-name-chips">
          {sourceBadges(held, draft).map((b) => (
            <Chip key={b}>{b}</Chip>
          ))}
          {t ? <Chip>{title(t.category)}</Chip> : <Chip tone="bad">not in content yet</Chip>}
        </span>
      </div>
      {t && <p className="effect">{t.effect}</p>}
      {places.length > 0 && (
        <p className="small">
          <strong>{t?.choices.find((c) => c.from === "place")?.note ?? "Place"}:</strong> {places.join(", ")}
        </p>
      )}
      <p className="muted small">From {held.sources.map(source).join(", ")}</p>
    </div>
  );
}

// A Knowledge's card, opened from the sheet's list in the site's lore popup.
function TraitModal({ held, places, draft, onClose }: { held: Held; places: string[]; draft: Draft; onClose: () => void }) {
  return (
    <LorePopup label={traitName(held.trait)} onClose={onClose} className="lore-modal-card">
      <TraitCard held={held} places={places} draft={draft} />
    </LorePopup>
  );
}

// The Conditions' and Items' boxes, straight into the stats' row, or, with a
// box to go over them, in a column with it beside the stats.
function MaybeStack({ top, children }: { top?: ReactNode; children: ReactNode }) {
  if (!top) return <>{children}</>;
  return (
    <div className="sheet-side-stack">
      {top}
      <div className="sheet-side-row">{children}</div>
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
  onLooks?: (looks: Pick<Draft, "age" | "gender" | "customGender">) => void;
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
  // Places go on their Trait's box, like "Which seas: the Mende coast".
  const places = (trait: string) => draft.choices.filter((c) => c.trait === trait && c.from === "place").flatMap((c) => c.traits);
  const held = summary?.traits ?? [];
  const isKnowledge = (h: Held) => traitById.get(h.trait)?.category === "knowledge";
  const isLanguage = (h: Held) => !!traitById.get(h.trait)?.types.includes("language");
  // Knowledges, then Languages, as on the sample sheet
  const knowledges = [...held.filter((h) => isKnowledge(h) && !isLanguage(h)), ...held.filter(isLanguage)];
  const others = held.filter((h) => !isKnowledge(h));
  const [open, setOpen] = useState<string>();
  const closeModal = useCallback(() => setOpen(undefined), []);
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
            <button onClick={onExport}>
              <Icon name="download" />
              Download
            </button>
            <button onClick={onImport}>
              <Icon name="upload" />
              Import
            </button>
            <button onClick={() => window.print()}>
              <Icon name="print" />
              Print
            </button>
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
                {/* Kind, age, gender, Origin, Profession and Past, as in Player Tools */}
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
        <div className="sheet-row">
          <div className="c-sheet-box sheet-body">
            {statsSlot ? (
              <div className="sheet-stats">{statsSlot}</div>
            ) : (
              <div className="sheet-stats">
                {groups.map((g) => (
                  <div key={g} className={`sheet-group stat-group-${g}`}>
                    <div className="sheet-group-head">
                      <span className="stat-badge" title="Core Stat">
                        {summary?.coreStats[g] ?? "–"}
                      </span>
                      <h4 className="rule">{title(g)}</h4>
                    </div>
                    {/* Magic: a diamond per point, under its number */}
                    {!STAT_GROUPS[g].length && (
                      <div className="sheet-stat">
                        <div className="tiny-text">
                          <strong>
                            Each point in {title(g)} adds {MP_PER_MAGIC} MP (Mana Points)
                          </strong>
                        </div>
                        <CoreLine bonus={summary?.coreBonus[g] ?? 0} value={summary?.coreStats[g] ?? draft.core[g]} />
                      </div>
                    )}
                    {STAT_GROUPS[g].map((s: StatId) => {
                      const value = summary?.stats[s];
                      // The Kind's bonus, with any free bonus points placed, shows gray.
                      const bonus = (base?.[s]?.bonus ?? 0) + (draft.startPoints?.[s] ?? 0);
                      const max = base?.[s]?.max ?? 0;
                      return (
                        <div key={s} className="sheet-stat">
                          <div className="tiny-text">
                            <strong>
                              {title(s)} - {value ?? "–"}
                            </strong>
                            <span className="muted"> max {base?.[s]?.max ?? "–"}</span>
                          </div>
                          <StatLine bonus={bonus} value={value ?? bonus} max={max} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          {onItems && onConditions && (
            // The Conditions and the Items, each in its own box along the row;
            // with resistances, under them, together beside the stats
            <MaybeStack top={resistancesSlot && <div className="c-sheet-box sheet-resistances">{resistancesSlot}</div>}>
              <div className="c-sheet-box sheet-conditions">
                <Conditions conditions={conditions ?? []} hp={hp ?? summary?.resources.hp ?? 0} maxHp={summary?.resources.hp ?? 0} onChange={onConditions} />
              </div>
              <div className="c-sheet-box sheet-items">
                <Items items={items ?? []} onChange={onItems} />
              </div>
            </MaybeStack>
          )}
        </div>

        {/* The Knowledges in their own box, to the left of the Traits */}
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
                      <button type="button" className="link" onClick={() => setOpen(h.trait)}>
                        {traitName(h.trait)}
                        {t?.ranked || h.rank > 1 ? ` (${h.rank})` : ""}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty">None yet.</p>
            )}
          </div>
          <div className="c-sheet-box">
            {traitsAction ? (
              // The action at the right end of the Traits title's line
              <div className="sheet-traits-head">
                <h3 className="subhead">Traits</h3>
                {traitsAction}
              </div>
            ) : (
              <h3 className="subhead">Traits</h3>
            )}
            {/* The picks the character still has to spend on Traits */}
            {summary && (
              <p className="sheet-banked">
                {summary.picks.universal.banked} universal and {summary.picks.background.banked} background{" "}
                {summary.picks.universal.banked + summary.picks.background.banked === 1 ? "pick" : "picks"} available
              </p>
            )}
            {others.length > 0 ? (
              <ul className="sheet-traits">
                {others.map((h) => (
                  <li key={h.trait}>
                    <TraitCard held={h} places={places(h.trait)} draft={draft} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">{held.length ? "No Traits besides Knowledges." : "No Traits yet."}</p>
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
        </div>
      </div>
      {opened && <TraitModal held={opened} places={places(opened.trait)} draft={draft} onClose={closeModal} />}
    </section>
  );
}
