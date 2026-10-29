import { useCallback, useEffect, useRef, useState } from "react";
import { FREE_TEXT_POOLS, MP_PER_MAGIC, type BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { coreStatsShown } from "../check.js";
import { content, kindById, packageById, traitById } from "../content.js";
import type { Draft } from "../draft.js";
import { askerName, baseStats, Chip, CoreLine, NameField, SettingIcon, StatLine, StepHeader, title, traitName, traitRegionClass } from "./ui.js";

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

// A held Trait, drawn like the site's Traits page cards (.trait-box)
function TraitCard({ held, places }: { held: Held; places: string[] }) {
  const t = traitById.get(held.trait);
  return (
    <div className={`trait-box ${traitRegionClass(held.trait)}`}>
      <div className="trait-name">
        <SettingIcon plane={t?.plane} />
        {traitName(held.trait)}
        {t?.ranked || held.rank > 1 ? ` (${held.rank})` : ""}
      </div>
      <div className="chips">{t ? <Chip>{title(t.category)}</Chip> : <Chip tone="bad">not in content yet</Chip>}</div>
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

// A Knowledge's card, opened from the sheet's list in the site's lore popup
// (.lore-modal). Escape, the backdrop and the close button shut it, and focus
// goes back to the link.
function TraitModal({ held, places, onClose }: { held: Held; places: string[]; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    document.documentElement.classList.add("lore-modal-open");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("lore-modal-open");
      opener?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="lore-modal is-open"
      role="dialog"
      aria-modal="true"
      aria-label={traitName(held.trait)}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="lore-modal-panel">
        <button ref={close} type="button" className="lore-modal-close" aria-label="Close" onClick={onClose}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2 2l16 16M18 2L2 18" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        <TraitCard held={held} places={places} />
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
  embedded = false,
}: {
  draft: Draft;
  result: BuildResult;
  onExport?: () => void;
  onImport?: () => void;
  onName?: (name?: string) => void;
  embedded?: boolean;
}) {
  const kind = draft.kind ? kindById.get(draft.kind) : undefined;
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
  const background: [string, string | undefined][] = [
    ["Kind", kind?.name],
    ["Origin", packages[0]?.name],
    ["Profession", packages[1]?.name],
    ["Past", packages[2]?.name],
  ];

  return (
    <section className={`sheet${embedded ? " sheet-embedded" : ""}`}>
      {!embedded && (
        <>
          <StepHeader step="sheet" title="Sheet" />
          {/* Whether the build is legal, then Export, Import and Print, above the sheet */}
          <div className="sheet-actions">
            <span className={`status ${result.ok ? "good" : "bad"}`}>{result.ok ? "Legal" : `${result.errors.length} ${result.errors.length === 1 ? "error" : "errors"}`}</span>
            <button onClick={onExport}>Export</button>
            <button onClick={onImport}>Import</button>
            <button onClick={() => window.print()}>Print</button>
          </div>
        </>
      )}
      <div className="c-sheet">
        {!embedded && (
          <div className="level-badge" aria-label={`Level ${draft.level}`}>
            {draft.level}
          </div>
        )}

        {!embedded && (
          <div className="c-sheet-box sheet-head">
            <div className="sheet-head-main">
              <NameField className="sheet-name" heading="h2" name={draft.name} onChange={onName ?? (() => {})} />
              <p className="lede">
                Level {draft.level} {kind?.name ?? "—"} · {packages.map((p) => p?.name ?? "—").join(" · ")}
              </p>
              <p className="sheet-resources">
                {resources.map((r) => (
                  <span key={r}>
                    <i>{summary?.resources[r] ?? "–"}</i> <strong>{r.toUpperCase()}</strong>
                  </span>
                ))}
              </p>
              {kind && kind.features.length > 0 && (
                <ul className="features kind-features">
                  {kind.features.map((f) => (
                    <li key={f.name}>
                      <strong>{f.name}.</strong> {f.description}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Kind, Origin, Profession and Past, beside the name */}
            <ul className="call-response sheet-background">
              {background.map(([label, value]) => (
                <li key={label}>
                  <span>{label}</span>
                  <strong>{value ?? "—"}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="c-sheet-box sheet-body">
          <div className="sheet-stats">
            {groups.map((g) => (
              <div key={g} className="sheet-group">
                <div className="sheet-group-head">
                  <span className="stat-badge" title="Core stat">
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

          <div className="sheet-side">
            <h4 className="rule">Knowledges</h4>
            {knowledges.length > 0 ? (
              <ul className="knowledge-list">
                {knowledges.map((h) => {
                  const t = traitById.get(h.trait);
                  return (
                    <li key={h.trait}>
                      <span className="tiny-text">{isLanguage(h) ? "Language:" : "Knowledge:"}</span>{" "}
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
            {summary && (
              <>
                <h4 className="rule">Banked picks</h4>
                <p>
                  {summary.picks.universal.banked} universal, {summary.picks.background.banked} background
                </p>
              </>
            )}
          </div>
        </div>

        <div className="c-sheet-box">
          <h3 className="subhead">Traits</h3>
          {others.length > 0 ? (
            <ul className="sheet-traits">
              {others.map((h) => (
                <li key={h.trait}>
                  <TraitCard held={h} places={places(h.trait)} />
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
      {opened && <TraitModal held={opened} places={places(opened.trait)} onClose={closeModal} />}
    </section>
  );
}
