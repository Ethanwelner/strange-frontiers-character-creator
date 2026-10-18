import type { BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { kindById, packageById, traitById } from "../content.js";
import type { Draft } from "../draft.js";
import { baseStats, Chip, GROUPS, title, traitName } from "./ui.js";

const SOURCE = /^(origin|profession|past) ([a-z0-9-]+)( choice)?$/;

// "origin glintl" → "Glintl (origin)"; pick sources read as they are.
function source(s: string) {
  const m = SOURCE.exec(s);
  if (!m) return s;
  return `${packageById.get(m[2]!)?.name ?? m[2]} (${m[1]}${m[3] ?? ""})`;
}

export function Sheet({ draft, result }: { draft: Draft; result: BuildResult }) {
  const kind = draft.kind ? kindById.get(draft.kind) : undefined;
  const form = kind?.forms?.find((f) => f.id === draft.form);
  const packages = [draft.origin, draft.profession, draft.past].map((id) => (id ? packageById.get(id) : undefined));
  const base = baseStats(draft);
  const summary = result.summary;
  const features = [
    ...(kind?.features ?? []).map((f) => ({ ...f, from: kind!.name })),
    ...(form?.features ?? []).map((f) => ({ ...f, from: form!.name })),
    ...packages.flatMap((p) => (p?.features ?? []).map((f) => ({ ...f, from: p!.name }))),
  ];

  return (
    <section className="sheet">
      <div className="sheet-head">
        <div>
          <h2>{draft.name || "Unnamed character"}</h2>
          <p className="lede">
            Level {draft.level} {form ? `${form.name} ` : ""}
            {kind?.name ?? "—"} · {packages.map((p) => p?.name ?? "—").join(" · ")}
          </p>
        </div>
        <div className="sheet-actions">
          <span className={`status ${result.ok ? "good" : "bad"}`}>
            {result.ok ? "Legal" : `${result.errors.length} errors`}
          </span>
          <button onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <h3 className="subhead">Stats</h3>
      <div className="sheet-stats">
        {GROUPS.map((g) => (
          <div key={g} className="sheet-group">
            <div className="sheet-group-head">
              <span>{title(g)}</span>
              <span className="num">Inner Ring {summary?.innerRing[g] ?? "–"}</span>
            </div>
            {STAT_GROUPS[g].map((s: StatId) => (
              <div key={s} className="sheet-stat">
                <span>{title(s)}</span>
                <span className="num big">{summary?.stats[s] ?? "–"}</span>
                <span className="muted num">max {base?.[s]?.max ?? "–"}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {summary && (
        <p className="muted">
          Banked picks: {summary.picks.universal.banked} universal, {summary.picks.background.banked} background.
        </p>
      )}

      <h3 className="subhead">Traits</h3>
      {summary && summary.traits.length > 0 ? (
        <ul className="sheet-traits">
          {summary.traits.map((h) => {
            const t = traitById.get(h.trait);
            return (
              <li key={h.trait}>
                <div className="card-head">
                  <strong>
                    {traitName(h.trait)}
                    {t?.ranked || h.rank > 1 ? ` ${h.rank}` : ""}
                  </strong>
                  {t ? <Chip tone="muted">{title(t.category)}</Chip> : <Chip>not in content yet</Chip>}
                </div>
                {t && <p className="effect">{t.effect}</p>}
                <p className="muted small">From {h.sources.map(source).join(", ")}</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">No Traits yet.</p>
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
    </section>
  );
}
