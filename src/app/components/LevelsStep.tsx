import type { LevelAllocation, StatGroup } from "../../engine/build.js";
import { OUTER_POINTS_PER_LEVEL as POINTS_PER_LEVEL, type BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import type { Draft } from "../draft.js";
import { baseStats, GROUPS, title } from "./ui.js";

const MAX_START = 10;

interface Props {
  draft: Draft;
  startingLevel: number;
  result: BuildResult;
  onChange: (d: Draft) => void;
  onStartingLevel: (level: number) => void;
}

export function LevelsStep({ draft, startingLevel, result, onChange, onStartingLevel }: Props) {
  const base = baseStats(draft);
  const stats = result.summary?.stats;

  const setLevel = (i: number, lvl: LevelAllocation) => {
    const levels = draft.levels.slice();
    levels[i] = lvl;
    onChange({ ...draft, levels });
  };
  const bump = (i: number, stat: StatId, by: number) => {
    const lvl = draft.levels[i]!;
    const next = Math.max(0, (lvl.points[stat] ?? 0) + by);
    const points = { ...lvl.points, [stat]: next };
    if (next === 0) delete points[stat];
    setLevel(i, { ...lvl, points });
  };

  return (
    <section>
      <h2>Levels</h2>
      <p className="lede">
        Each level gives 1 Inner Ring point in one group and {POINTS_PER_LEVEL} Outer Ring points to spread among that group's stats.
      </p>
      <label className="field inline">
        <span>Starting level</span>
        <select value={startingLevel} onChange={(e) => onStartingLevel(Number(e.target.value))}>
          {Array.from({ length: MAX_START }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="muted">Your GM sets this; most campaigns start at 1.</span>
      </label>

      <div className="levels">
        {draft.levels.map((lvl, i) => {
          const spent = Object.values(lvl.points).reduce((n, p) => n + (p ?? 0), 0);
          return (
            <div key={i} className="level-card">
              <div className="card-head">
                <h3>Level {i + 1}</h3>
                <span className={`num${spent === POINTS_PER_LEVEL ? " good" : spent > POINTS_PER_LEVEL ? " bad" : ""}`}>
                  {spent}/{POINTS_PER_LEVEL} points
                </span>
              </div>
              <div className="segmented" role="radiogroup" aria-label={`Level ${i + 1} Inner Ring group`}>
                {GROUPS.map((g) => (
                  <button
                    key={g}
                    role="radio"
                    aria-checked={lvl.group === g}
                    className={lvl.group === g ? "on" : ""}
                    onClick={() => lvl.group !== g && setLevel(i, { group: g as StatGroup, points: {} })}
                  >
                    {title(g)}
                  </button>
                ))}
              </div>
              {STAT_GROUPS[lvl.group].map((s: StatId) => {
                const total = stats?.[s];
                const max = base?.[s]?.max;
                const over = total !== undefined && max !== undefined && total > max;
                return (
                  <div key={s} className="stepper-row">
                    <span className="stepper-label">{title(s)}</span>
                    <div className="stepper">
                      <button aria-label={`Remove a point from ${s} at level ${i + 1}`} onClick={() => bump(i, s, -1)} disabled={!lvl.points[s]}>
                        −
                      </button>
                      <span className="num">{lvl.points[s] ?? 0}</span>
                      <button aria-label={`Add a point to ${s} at level ${i + 1}`} onClick={() => bump(i, s, 1)}>
                        +
                      </button>
                    </div>
                    <span className={`stepper-total num${over ? " bad" : ""}`}>
                      {total ?? "–"}
                      <span className="muted">/{max ?? "–"}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
