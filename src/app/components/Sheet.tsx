import { FREE_TEXT_POOLS, type BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { kindById, packageById, traitById } from "../content.js";
import type { Draft } from "../draft.js";
import { askerName, baseStats, Chip, GROUPS, StatLine, StepHeader, title, traitName } from "./ui.js";

const SOURCE = /^(origin|profession|past) ([a-z0-9-]+)( choice)?$/;
const TRAIT_CHOICE = /^trait ([a-z0-9-]+) choice$/;

// "origin dreft" → "Dreft (origin)", "trait additional-language choice" →
// "Additional Language (choice)"; pick sources read as they are.
function source(s: string) {
  const t = TRAIT_CHOICE.exec(s);
  if (t) return `${traitName(t[1]!)} (choice)`;
  const m = SOURCE.exec(s);
  if (!m) return s;
  return `${packageById.get(m[2]!)?.name ?? m[2]} (${m[1]}${m[3] ?? ""})`;
}

// Laid out like the sample character sheet on the site's Mechanics tab.
export function Sheet({ draft, result }: { draft: Draft; result: BuildResult }) {
  const kind = draft.kind ? kindById.get(draft.kind) : undefined;
  const packages = [draft.origin, draft.profession, draft.past].map((id) => (id ? packageById.get(id) : undefined));
  const base = baseStats(draft);
  const summary = result.summary;
  // Contacts and other free-text answers, as the player wrote them.
  const records = draft.choices.flatMap((c) =>
    FREE_TEXT_POOLS[c.from] ? c.traits.map((text) => ({ text, noun: FREE_TEXT_POOLS[c.from]!, from: askerName(c) })) : [],
  );
  const features = [
    ...(kind?.features ?? []).map((f) => ({ ...f, from: kind!.name })),
    ...packages.flatMap((p) => (p?.features ?? []).map((f) => ({ ...f, from: p!.name }))),
  ];
  const background: [string, string | undefined][] = [
    ["Kind", kind?.name],
    ["Origin", packages[0]?.name],
    ["Profession", packages[1]?.name],
    ["Past", packages[2]?.name],
  ];

  return (
    <section className="sheet">
      <StepHeader step="sheet" title="Sheet" />
      <div className="c-sheet">
        <div className="level-badge" aria-label={`Level ${draft.level}`}>
          {draft.level}
        </div>

        <div className="c-sheet-box sheet-head">
          <div>
            <h2>{draft.name || "Unnamed character"}</h2>
            <p className="lede">
              Level {draft.level} {kind?.name ?? "—"} · {packages.map((p) => p?.name ?? "—").join(" · ")}
            </p>
          </div>
          <div className="sheet-actions">
            <span className={`status ${result.ok ? "good" : "bad"}`}>{result.ok ? "Legal" : `${result.errors.length} errors`}</span>
            <button onClick={() => window.print()}>Print</button>
          </div>
        </div>

        <div className="c-sheet-box sheet-body">
          <div className="sheet-stats">
            {GROUPS.map((g) => (
              <div key={g} className="sheet-group">
                <div className="sheet-group-head">
                  <span className="stat-badge" title="Inner Ring">
                    {summary?.innerRing[g] ?? "–"}
                  </span>
                  <h4 className="rule">{title(g)}</h4>
                </div>
                {STAT_GROUPS[g].map((s: StatId) => {
                  const value = summary?.stats[s];
                  const start = base?.[s]?.start ?? 0;
                  const max = base?.[s]?.max ?? 0;
                  return (
                    <div key={s} className="sheet-stat">
                      <div className="tiny-text">
                        <strong>
                          {title(s)} - {value ?? "–"}
                        </strong>
                        <span className="muted"> max {base?.[s]?.max ?? "–"}</span>
                      </div>
                      <StatLine start={start} value={value ?? start} max={max} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="sheet-side">
            <h4 className="rule">Background</h4>
            <ul className="call-response">
              {background.map(([label, value]) => (
                <li key={label}>
                  <span>{label}</span>
                  <strong>{value ?? "—"}</strong>
                </li>
              ))}
            </ul>
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
          {summary && summary.traits.length > 0 ? (
            <ul className="sheet-traits">
              {summary.traits.map((h) => {
                const t = traitById.get(h.trait);
                return (
                  <li key={h.trait} className="trait-box">
                    <div className="trait-name">
                      {traitName(h.trait)}
                      {t?.ranked || h.rank > 1 ? ` (${h.rank})` : ""}
                    </div>
                    <div className="chips">{t ? <Chip>{title(t.category)}</Chip> : <Chip tone="bad">not in content yet</Chip>}</div>
                    {t && <p className="effect">{t.effect}</p>}
                    <p className="muted small">From {h.sources.map(source).join(", ")}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty">No Traits yet.</p>
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
    </section>
  );
}
