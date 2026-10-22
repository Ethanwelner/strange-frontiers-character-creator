import type { StatGroup } from "../../engine/build.js";
import { FOCUS_POINTS_PER_LEVEL as POINTS_PER_LEVEL } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { kindById } from "../content.js";
import { withCore, type Draft } from "../draft.js";
import { baseStats, GROUPS, StatLine, StepHeader, title } from "./ui.js";

interface Props {
  draft: Draft;
  onChange: (d: Draft) => void;
}

// Stats as a pool, drawn like the character sheet. Each core point (one
// per level) goes to a group and unlocks 3 focus points for that group's
// stats, which the player adds with each stat's + and −. The stats' circle and
// square bars show the result, with the Kind's level 0 stats in gray.
//
// A group's stats only take points its core stat has unlocked, so the player
// levels the core stat first, with +. A stat's + spends the Kind's free
// level 0 points first (the AI Core's 3, which need no core point), then the
// group's unlocked points. Taking a point back returns the group's points first,
// then the free ones; core points stay put until the player takes them
// back with −. A group can't take a core point its stats have no room
// for, like an AI Core's Physical, where every max is 0.
export function StatsStep({ draft, onChange }: Props) {
  const base = baseStats(draft);
  const free = (draft.kind ? kindById.get(draft.kind)?.freePoints : 0) ?? 0;
  const start = draft.startPoints ?? {};
  const freeLeft = free - Object.values(start).reduce((n, p) => n + (p ?? 0), 0);
  const corePlaced = GROUPS.reduce((n, g) => n + draft.core[g], 0);
  const coreLeft = draft.level - corePlaced;
  const spentIn = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + (draft.points[s] ?? 0), 0);
  const kindStart = (s: StatId) => base?.[s]?.start ?? 0;
  const level0 = (s: StatId) => kindStart(s) + (start[s] ?? 0);
  const valueOf = (s: StatId) => level0(s) + (draft.points[s] ?? 0);

  // One point on or off a stat: on from the free level 0 points while any are
  // left, otherwise from the group's unlocked points; off from the group's
  // points first.
  const bump = (s: StatId, by: 1 | -1) => {
    const startPoints = { ...start };
    const points = { ...draft.points };
    if (by > 0) {
      if (freeLeft > 0) startPoints[s] = (startPoints[s] ?? 0) + 1;
      else points[s] = (points[s] ?? 0) + 1;
    } else if (points[s]) points[s] -= 1;
    else if (startPoints[s]) startPoints[s] -= 1;
    if (!startPoints[s]) delete startPoints[s];
    if (!points[s]) delete points[s];
    onChange({ ...draft, startPoints, points });
  };

  if (!base) {
    return (
      <section>
        <StepHeader step="stats" title="Stats" />
        <p className="empty">Choose a Kind first; it sets your level 0 stats and how far each can go.</p>
      </section>
    );
  }

  return (
    <section>
      <StepHeader step="stats" title="Stats">
        Each level gives a core point. Level a group's core stat with the + beside its number to unlock {POINTS_PER_LEVEL} focus points for its
        stats, then spend them with each stat's +. A group's stats can't take points until its core stat is leveled. Your Kind's level 0 stats are already
        filled in, in gray.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
        <p className="pool-summary">
          <span className={`num${coreLeft === 0 ? " good" : coreLeft < 0 ? " bad" : ""}`}>
            {corePlaced}/{draft.level}
          </span>{" "}
          core points placed
          {coreLeft > 0 && <span className="muted"> · {coreLeft} left</span>}
          {free > 0 && (
            <>
              {" · "}
              <span className={`num${freeLeft === 0 ? " good" : ""}`}>
                {free - freeLeft}/{free}
              </span>{" "}
              free level 0 points placed
              <span className="muted"> (spent first, on any stat)</span>
            </>
          )}
        </p>

        <div className="pool-stats">
          {GROUPS.map((g) => {
            const core = draft.core[g];
            const room = core * POINTS_PER_LEVEL;
            const spent = spentIn(g);
            // Points any of this group's stats could still take.
            const spare = Math.max(0, freeLeft) + Math.max(0, room - spent);
            const locked = spare === 0 && spent === 0;
            // Room left under the group's maxes, after the points already unlocked.
            const headroom = STAT_GROUPS[g].reduce((n, s) => n + Math.max(0, (base[s]?.max ?? 0) - valueOf(s)), 0) - Math.max(0, room - spent);
            const canLevel = coreLeft > 0 && headroom >= POINTS_PER_LEVEL;
            // Taking a core point back would strand focus points.
            const stranded = spent > (core - 1) * POINTS_PER_LEVEL;
            return (
              <div key={g} className={`sheet-group${locked ? " locked" : ""}`}>
                <div className="sheet-group-head">
                  <div className="core-control">
                    <span className="stat-badge" title="Core stat">
                      {core}
                    </span>
                    <button
                      aria-label={`Take a core point from ${g}`}
                      title={core > 0 && stranded ? `Take ${spent - (core - 1) * POINTS_PER_LEVEL} focus points out first` : undefined}
                      onClick={() => onChange(withCore(draft, g, core - 1))}
                      disabled={core === 0 || stranded}
                    >
                      −
                    </button>
                    <button
                      aria-label={`Put a core point in ${g}`}
                      title={coreLeft > 0 && !canLevel ? `${title(g)}'s stats have no room for ${POINTS_PER_LEVEL} more points` : undefined}
                      onClick={() => onChange(withCore(draft, g, core + 1))}
                      disabled={!canLevel}
                    >
                      +
                    </button>
                  </div>
                  <h4 className="rule">{title(g)}</h4>
                  <span className={`num${core === 0 ? " muted" : spent === room ? " good" : spent > room ? " bad" : ""}`}>
                    {spent}/{room}
                  </span>
                </div>
                {core === 0 && !canLevel && headroom < POINTS_PER_LEVEL && <p className="hint">These stats have no room for points.</p>}
                {STAT_GROUPS[g].map((s: StatId) => {
                  const value = valueOf(s);
                  const max = base[s]?.max ?? 0;
                  return (
                    <div key={s} className="sheet-stat">
                      <div className="tiny-text">
                        <strong>
                          {title(s)} - {value}
                        </strong>
                        <span className="muted"> max {max}</span>
                      </div>
                      <div className="pool-stat-row">
                        <div className="stat-buttons">
                          <button aria-label={`Take a point from ${s}`} onClick={() => bump(s, -1)} disabled={value <= kindStart(s)}>
                            −
                          </button>
                          <button aria-label={`Add a point to ${s}`} onClick={() => bump(s, 1)} disabled={spare === 0 || value >= max}>
                            +
                          </button>
                        </div>
                        <StatLine start={level0(s)} value={value} max={max} />
                      </div>
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
