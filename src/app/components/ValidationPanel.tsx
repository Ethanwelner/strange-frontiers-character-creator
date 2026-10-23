import { useState } from "react";
import type { BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import type { Draft } from "../draft.js";
import { baseStats, GROUPS, title } from "./ui.js";

interface Props {
  draft: Draft;
  result: BuildResult;
}

export function ValidationPanel({ draft, result }: Props) {
  const [open, setOpen] = useState(false);
  const { summary } = result;
  const base = baseStats(draft);

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
        <h3 className={`panel-name${draft.name ? "" : " muted"}`}>{draft.name ?? "Unnamed character"}</h3>
        <h4>Stats</h4>
        <div className="panel-stats">
          {GROUPS.map((g) => (
            <div key={g} className="panel-group">
              <div className="panel-group-head">
                <span>{title(g)}</span>
                <span className="num">Core {summary ? summary.coreStats[g] : "–"}</span>
              </div>
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

        {result.ok && <p className="good">Every rule checks out.</p>}
      </div>
    </aside>
  );
}
