import type { StatGroup } from "../../engine/build.js";
import { OUTER_POINTS_PER_LEVEL as POINTS_PER_LEVEL, type BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import type { Draft } from "../draft.js";
import { baseStats, GROUPS, StepHeader, title } from "./ui.js";

const MAX_START = 10;

interface Props {
  draft: Draft;
  startingLevel: number;
  result: BuildResult;
  onChange: (d: Draft) => void;
  onStartingLevel: (level: number) => void;
}

// Each level's points, with Physical, Social and Mental stacked. A level's
// points all go to one group, so the first point picks the group and the other
// groups lock until that level's points are taken back out.
export function StatsStep({ draft, startingLevel, result, onChange, onStartingLevel }: Props) {
  const base = baseStats(draft);
  // The engine's totals once the build is complete enough to check; before
  // that, the Kind's level 0 stats plus the points spent here.
  const total = (s: StatId) =>
    result.summary?.stats[s] ?? (base ? (base[s]?.start ?? 0) + draft.levels.reduce((n, l) => n + (l.points[s] ?? 0), 0) : undefined);

  const bump = (i: number, group: StatGroup, stat: StatId, by: number) => {
    const lvl = draft.levels[i]!;
    const next = Math.max(0, (lvl.points[stat] ?? 0) + by);
    const points = { ...lvl.points, [stat]: next };
    if (next === 0) delete points[stat];
    const levels = draft.levels.slice();
    levels[i] = { group, points };
    onChange({ ...draft, levels });
  };

  return (
    <section>
      <StepHeader step="stats" title="Stats">
        Each level gives 1 Inner Ring point in one group and {POINTS_PER_LEVEL} Outer Ring points to spread among that group's stats.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
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
            const active = spent > 0 ? lvl.group : undefined;
            return (
              <div key={i} className="level-card">
                <div className="card-head">
                  <h3>Level {i + 1}</h3>
                  <span className={`num${spent === POINTS_PER_LEVEL ? " good" : spent > POINTS_PER_LEVEL ? " bad" : ""}`}>
                    {spent}/{POINTS_PER_LEVEL} points
                  </span>
                </div>
                <p className="hint">
                  {active
                    ? `${title(active)} gets this level's Inner Ring point. Take its points back out to use another group.`
                    : "Add a point to any stat to give that group this level's Inner Ring point."}
                </p>
                {GROUPS.map((g) => {
                  const locked = active !== undefined && active !== g;
                  return (
                    <div key={g} className={`stat-group${locked ? " locked" : ""}${active === g ? " active" : ""}`}>
                      <h4 className="rule">
                        {title(g)}
                        {active === g && <span className="inner-ring">Inner Ring +1</span>}
                      </h4>
                      {STAT_GROUPS[g].map((s: StatId) => {
                        const value = total(s);
                        const max = base?.[s]?.max;
                        const over = value !== undefined && max !== undefined && value > max;
                        return (
                          <div key={s} className="stepper-row">
                            <span className="stepper-label">{title(s)}</span>
                            <div className="stepper">
                              <button
                                aria-label={`Remove a point from ${s} at level ${i + 1}`}
                                onClick={() => bump(i, g, s, -1)}
                                disabled={locked || !lvl.points[s]}
                              >
                                −
                              </button>
                              <span className="num">{lvl.points[s] ?? 0}</span>
                              <button
                                aria-label={`Add a point to ${s} at level ${i + 1}`}
                                onClick={() => bump(i, g, s, 1)}
                                disabled={locked || spent >= POINTS_PER_LEVEL}
                              >
                                +
                              </button>
                            </div>
                            <span className={`stepper-total num${over ? " bad" : ""}`}>
                              {value ?? "–"}
                              <span className="muted">/{max ?? "–"}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
