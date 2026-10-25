import { useState } from "react";
import { MP_PER_MAGIC, type BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { coreStatsShown } from "../check.js";
import { content, packageById } from "../content.js";
import type { Draft } from "../draft.js";
import { baseStats, NameField, title } from "./ui.js";

interface Props {
  draft: Draft;
  result: BuildResult;
  onName: (name?: string) => void;
}

export function ValidationPanel({ draft, result, onName }: Props) {
  const [open, setOpen] = useState(false);
  const { summary } = result;
  const base = baseStats(draft);
  // The background packages, with a dash for each one not picked yet, like the stats
  const background = (["origin", "profession", "past"] as const).map(
    (slot) => [title(slot), draft[slot] ? (packageById.get(draft[slot])?.name ?? draft[slot]) : "–"] as const,
  );

  return (
    <aside className={`panel${open ? " open" : ""}`} aria-label="Validation">
      <button className="panel-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`panel-toggle-name${draft.name ? "" : " muted"}`}>{draft.name ?? "Unnamed character"}</span>
        {summary && (
          <span className="num">
            U {summary.picks.universal.spent}/{summary.picks.universal.available} · B {summary.picks.background.spent}/
            {summary.picks.background.available}
          </span>
        )}
        <span className="muted">{open ? "Hide" : "Details"}</span>
      </button>

      <div className="panel-body">
        <NameField className="panel-name" heading="h3" name={draft.name} onChange={onName} />
        <ul className="panel-background">
          {background.map(([label, name]) => (
            <li key={label} className="panel-stat">
              <span>{label}</span>
              <strong>{name}</strong>
            </li>
          ))}
        </ul>
        <h4>Stats</h4>
        <div className="panel-stats">
          {coreStatsShown(draft, content, result).map((g) => (
            <div key={g} className="panel-group">
              <div className="panel-group-head">
                <span>{title(g)}</span>
                <span className="num">Core {summary ? summary.coreStats[g] : "–"}</span>
              </div>
              {/* Magic has no focus stats; its points show as MP */}
              {!STAT_GROUPS[g].length && (
                <div className="panel-stat">
                  <span>MP</span>
                  <span className="num">{summary ? summary.resources.mp : MP_PER_MAGIC * draft.core[g]}</span>
                </div>
              )}
              {STAT_GROUPS[g].map((s: StatId) => {
                const v = summary?.stats[s];
                const max = base?.[s]?.max;
                const over = v !== undefined && max !== undefined && v > max;
                return (
                  <div key={s} className="panel-stat">
                    <span>{title(s)}</span>
                    <span className={`num${over ? " bad" : ""}`}>
                      {v ?? "–"}
                      <span className="muted"> / {max ?? "–"}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <h4>Picks</h4>
        <table className="picks-table">
          <thead>
            <tr>
              <th></th>
              <th>Available</th>
              <th>Spent</th>
              <th>Banked</th>
            </tr>
          </thead>
          <tbody>
            {(["universal", "background"] as const).map((k) => {
              const p = summary?.picks[k];
              return (
                <tr key={k}>
                  <th>{title(k)}</th>
                  <td className="num">{p?.available ?? "–"}</td>
                  <td className={`num${p && p.spent > p.available ? " bad" : ""}`}>{p?.spent ?? "–"}</td>
                  <td className="num">{p?.banked ?? "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
