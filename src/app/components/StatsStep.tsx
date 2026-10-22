import type { StatGroup } from "../../engine/build.js";
import { OUTER_POINTS_PER_LEVEL as POINTS_PER_LEVEL, type BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { kindById } from "../content.js";
import { withInner, type Draft } from "../draft.js";
import { baseStats, GROUPS, StepHeader, title } from "./ui.js";

interface Props {
  draft: Draft;
  result: BuildResult;
  onChange: (d: Draft) => void;
}

// Stats as a pool. Each Inner Ring point (one per level) goes to a group and
// unlocks 3 Outer Ring points for that group's stats; the Kind's level 0 stats
// are already filled in underneath. A Kind with free level 0 points, like the
// AI Core, gets a Level 0 card first, where the points can go to any stat with
// room.
export function StatsStep({ draft, result, onChange }: Props) {
  const base = baseStats(draft);
  const free = (draft.kind ? kindById.get(draft.kind)?.freePoints : 0) ?? 0;
  const start = draft.startPoints ?? {};
  const placed = Object.values(start).reduce((n, p) => n + (p ?? 0), 0);
  const innerPlaced = GROUPS.reduce((n, g) => n + draft.inner[g], 0);
  const innerLeft = draft.level - innerPlaced;
  const spentIn = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + (draft.points[s] ?? 0), 0);
  // The engine's totals once the build is complete enough to check; before
  // that, the Kind's level 0 stats plus the points spent here.
  const total = (s: StatId) => result.summary?.stats[s] ?? (base ? (base[s]?.start ?? 0) + (start[s] ?? 0) + (draft.points[s] ?? 0) : undefined);

  const bumpStart = (stat: StatId, by: number) => {
    const next = Math.max(0, (start[stat] ?? 0) + by);
    const startPoints = { ...start, [stat]: next };
    if (next === 0) delete startPoints[stat];
    onChange({ ...draft, startPoints });
  };

  const bump = (stat: StatId, by: number) => {
    const next = Math.max(0, (draft.points[stat] ?? 0) + by);
    const points = { ...draft.points, [stat]: next };
    if (next === 0) delete points[stat];
    onChange({ ...draft, points });
  };

  return (
    <section>
      <StepHeader step="stats" title="Stats">
        Each level gives an Inner Ring point. Put it in Physical, Social or Mental to unlock {POINTS_PER_LEVEL} Outer Ring points for that group's stats.
        Your Kind's level 0 stats are already filled in.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
        <p className="pool-summary">
          <span className={`num${innerLeft === 0 ? " good" : innerLeft < 0 ? " bad" : ""}`}>
            {innerPlaced}/{draft.level}
          </span>{" "}
          Inner Ring points placed
          {innerLeft > 0 && <span className="muted"> · {innerLeft} left</span>}
        </p>
        <div className="levels">
          {free > 0 && (
            <div className="level-card">
              <div className="card-head">
                <h3>Level 0</h3>
                <span className={`num${placed === free ? " good" : ""}`}>
                  {placed}/{free} points
                </span>
              </div>
              <p className="hint">Your Kind gives {free} points to place in any stats it allows, before level 1.</p>
              {GROUPS.map((g) => (
                <div key={g} className="stat-group">
                  <h4 className="rule">{title(g)}</h4>
                  {STAT_GROUPS[g].map((s: StatId) => {
                    const value = total(s);
                    const max = base?.[s]?.max;
                    const full = value !== undefined && max !== undefined && value >= max;
                    return (
                      <div key={s} className="stepper-row">
                        <span className="stepper-label">{title(s)}</span>
                        <div className="stepper">
                          <button aria-label={`Remove a level 0 point from ${s}`} onClick={() => bumpStart(s, -1)} disabled={!start[s]}>
                            −
                          </button>
                          <span className="num">{start[s] ?? 0}</span>
                          <button aria-label={`Add a level 0 point to ${s}`} onClick={() => bumpStart(s, 1)} disabled={placed >= free || full}>
                            +
                          </button>
                        </div>
                        <span className="stepper-total num">
                          {value ?? "–"}
                          <span className="muted">/{max ?? "–"}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {GROUPS.map((g) => {
            const inner = draft.inner[g];
            const room = inner * POINTS_PER_LEVEL;
            const spent = spentIn(g);
            const locked = inner === 0;
            // Taking an Inner Ring point back would strand Outer Ring points.
            const stranded = spent > (inner - 1) * POINTS_PER_LEVEL;
            return (
              <div key={g} className={`level-card pool-card${locked ? " locked" : ""}`}>
                <div className="card-head">
                  <h3>{title(g)}</h3>
                  <span className={`num${locked ? "" : spent === room ? " good" : spent > room ? " bad" : ""}`}>
                    {spent}/{room} Outer Ring points
                  </span>
                </div>
                <div className="stepper-row inner-row">
                  <span className="stepper-label">
                    <strong>Inner Ring</strong>
                  </span>
                  <div className="stepper">
                    <button
                      aria-label={`Take an Inner Ring point from ${g}`}
                      title={inner > 0 && stranded ? `Take ${spent - (inner - 1) * POINTS_PER_LEVEL} Outer Ring points out first` : undefined}
                      onClick={() => onChange(withInner(draft, g, inner - 1))}
                      disabled={inner === 0 || stranded}
                    >
                      −
                    </button>
                    <span className="num">{inner}</span>
                    <button aria-label={`Put an Inner Ring point in ${g}`} onClick={() => onChange(withInner(draft, g, inner + 1))} disabled={innerLeft <= 0}>
                      +
                    </button>
                  </div>
                  <span className="stepper-total" />
                </div>
                <p className="hint">
                  {locked
                    ? `Put an Inner Ring point here to unlock ${POINTS_PER_LEVEL} points for ${title(g)}'s stats.`
                    : `Each Inner Ring point here unlocks ${POINTS_PER_LEVEL} points for these stats.`}
                </p>
                <div className="stat-group">
                  {STAT_GROUPS[g].map((s: StatId) => {
                    const value = total(s);
                    const max = base?.[s]?.max;
                    const over = value !== undefined && max !== undefined && value > max;
                    const full = value !== undefined && max !== undefined && value >= max;
                    return (
                      <div key={s} className="stepper-row">
                        <span className="stepper-label">{title(s)}</span>
                        <div className="stepper">
                          <button aria-label={`Remove a point from ${s}`} onClick={() => bump(s, -1)} disabled={!draft.points[s]}>
                            −
                          </button>
                          <span className="num">{draft.points[s] ?? 0}</span>
                          <button aria-label={`Add a point to ${s}`} onClick={() => bump(s, 1)} disabled={locked || spent >= room || full}>
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
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
