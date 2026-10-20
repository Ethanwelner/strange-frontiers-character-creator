import { useState } from "react";
import type { BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { describe, stepOf } from "../check.js";
import type { Draft, Step } from "../draft.js";
import { baseStats, GROUPS, title } from "./ui.js";

interface Props {
  draft: Draft;
  result: BuildResult;
  onName: (name: string | undefined) => void;
  onJump: (step: Step) => void;
}

export function ValidationPanel({ draft, result, onName, onJump }: Props) {
  const [open, setOpen] = useState(false);
  const { errors, warnings, summary } = result;
  const base = baseStats(draft);
  const jump = (step: Step) => {
    setOpen(false);
    onJump(step);
  };
  const status = result.ok ? "Legal" : `${errors.length} ${errors.length === 1 ? "error" : "errors"}`;

  return (
    <aside className={`panel${open ? " open" : ""}`} aria-label="Validation">
      <button className="panel-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`status ${result.ok ? "good" : "bad"}`}>
          {status}
          {warnings.length > 0 && <span className="warn"> · {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}</span>}
        </span>
        {summary && (
          <span className="num">
            U {summary.picks.universal.spent}/{summary.picks.universal.available} · B {summary.picks.background.spent}/
            {summary.picks.background.available}
          </span>
        )}
        <span className="muted">{open ? "Hide" : "Details"}</span>
      </button>

      <div className="panel-body">
        <label className="field name-field">
          <span className="field-label">Character Name</span>
          <input value={draft.name ?? ""} placeholder="Unnamed character" onChange={(e) => onName(e.target.value || undefined)} />
        </label>

        <div className="panel-status">
          <span className={`status ${result.ok ? "good" : "bad"}`}>{status}</span>
          {warnings.length > 0 && <span className="status warn">{warnings.length} {warnings.length === 1 ? "warning" : "warnings"}</span>}
        </div>

        <h4>Stats</h4>
        <div className="panel-stats">
          {GROUPS.map((g) => (
            <div key={g} className="panel-group">
              <div className="panel-group-head">
                <span>{title(g)}</span>
                <span className="num">Inner Ring {summary ? summary.innerRing[g] : "–"}</span>
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

        {errors.length > 0 && (
          <>
            <h4>Errors</h4>
            <ul className="issues bad">
              {errors.map((e, i) => (
                <li key={i}>
                  <button className="link" onClick={() => jump(stepOf(e))}>
                    {describe(e, draft)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {warnings.length > 0 && (
          <>
            <h4>Warnings</h4>
            <ul className="issues warn">
              {warnings.map((w, i) => (
                <li key={i}>
                  <button className="link" onClick={() => jump(stepOf(w))}>
                    {w.message}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {result.ok && warnings.length === 0 && <p className="good">Every rule checks out.</p>}
      </div>
    </aside>
  );
}
