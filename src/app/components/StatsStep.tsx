import type { StatGroup } from "../../engine/build.js";
import { OUTER_POINTS_PER_LEVEL as POINTS_PER_LEVEL } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { kindById } from "../content.js";
import { withInner, type Draft } from "../draft.js";
import { baseStats, GROUPS, StatLineInput, StepHeader, title } from "./ui.js";

interface Props {
  draft: Draft;
  onChange: (d: Draft) => void;
}

// Stats as a pool, drawn like the character sheet. Each Inner Ring point (one
// per level) goes to a group and unlocks 3 Outer Ring points for that group's
// stats, which the player fills in on the stats' circle and square bars. The
// Kind's level 0 stats are already filled in, in gray.
//
// A group's stats only take points its Inner Ring has unlocked, so the player
// levels the Inner Ring first, with +. Clicking a bar spends the Kind's free
// level 0 points first (the AI Core's 3, which need no Inner Ring), then the
// group's unlocked points. Taking points back returns the group's points first,
// then the free ones; Inner Ring points stay put until the player takes them
// back with −. A group can't take an Inner Ring point its stats have no room
// for, like an AI Core's Physical, where every max is 0.
export function StatsStep({ draft, onChange }: Props) {
  const base = baseStats(draft);
  const free = (draft.kind ? kindById.get(draft.kind)?.freePoints : 0) ?? 0;
  const start = draft.startPoints ?? {};
  const freeLeft = free - Object.values(start).reduce((n, p) => n + (p ?? 0), 0);
  const innerPlaced = GROUPS.reduce((n, g) => n + draft.inner[g], 0);
  const innerLeft = draft.level - innerPlaced;
  const spentIn = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + (draft.points[s] ?? 0), 0);
  const kindStart = (s: StatId) => base?.[s]?.start ?? 0;
  const level0 = (s: StatId) => kindStart(s) + (start[s] ?? 0);
  const valueOf = (s: StatId) => level0(s) + (draft.points[s] ?? 0);

  const setStat = (g: StatGroup, s: StatId, target: number) => {
    const startPoints = { ...start };
    const points = { ...draft.points };
    const value = valueOf(s);
    if (target > value) {
      const need = target - value;
      const fromFree = Math.min(need, Math.max(0, freeLeft));
      const roomLeft = Math.max(0, draft.inner[g] * POINTS_PER_LEVEL - spentIn(g));
      const fromGroup = Math.min(need - fromFree, roomLeft);
      startPoints[s] = (startPoints[s] ?? 0) + fromFree;
      points[s] = (points[s] ?? 0) + fromGroup;
    } else {
      let drop = value - target;
      const fromGroup = Math.min(drop, points[s] ?? 0);
      points[s] = (points[s] ?? 0) - fromGroup;
      drop -= fromGroup;
      startPoints[s] = (startPoints[s] ?? 0) - Math.min(drop, startPoints[s] ?? 0);
    }
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
        Each level gives an Inner Ring point. Level a group's Inner Ring with + to unlock {POINTS_PER_LEVEL} Outer Ring points for its stats, then click a stat's
        bar to fill them in. Your Kind's level 0 stats are already filled in, in gray.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
        <p className="pool-summary">
          <span className={`num${innerLeft === 0 ? " good" : innerLeft < 0 ? " bad" : ""}`}>
            {innerPlaced}/{draft.level}
          </span>{" "}
          Inner Ring points placed
          {innerLeft > 0 && <span className="muted"> · {innerLeft} left</span>}
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
            const inner = draft.inner[g];
            const room = inner * POINTS_PER_LEVEL;
            const spent = spentIn(g);
            // Points any of this group's stats could still take.
            const spare = Math.max(0, freeLeft) + Math.max(0, room - spent);
            const locked = spare === 0 && spent === 0;
            // Room left under the group's maxes, after the points already unlocked.
            const headroom = STAT_GROUPS[g].reduce((n, s) => n + Math.max(0, (base[s]?.max ?? 0) - valueOf(s)), 0) - Math.max(0, room - spent);
            const canLevel = innerLeft > 0 && headroom >= POINTS_PER_LEVEL;
            // Taking an Inner Ring point back would strand Outer Ring points.
            const stranded = spent > (inner - 1) * POINTS_PER_LEVEL;
            return (
              <div key={g} className={`sheet-group${locked ? " locked" : ""}`}>
                <div className="sheet-group-head">
                  <div className="inner-control">
                    <button
                      aria-label={`Take an Inner Ring point from ${g}`}
                      title={inner > 0 && stranded ? `Take ${spent - (inner - 1) * POINTS_PER_LEVEL} Outer Ring points out first` : undefined}
                      onClick={() => onChange(withInner(draft, g, inner - 1))}
                      disabled={inner === 0 || stranded}
                    >
                      −
                    </button>
                    <span className="stat-badge" title="Inner Ring">
                      {inner}
                    </span>
                    <button
                      aria-label={`Put an Inner Ring point in ${g}`}
                      title={innerLeft > 0 && !canLevel ? `${title(g)}'s stats have no room for ${POINTS_PER_LEVEL} more points` : undefined}
                      onClick={() => onChange(withInner(draft, g, inner + 1))}
                      disabled={!canLevel}
                    >
                      +
                    </button>
                  </div>
                  <h4 className="rule">{title(g)}</h4>
                  <span className={`num${inner === 0 ? " muted" : spent === room ? " good" : spent > room ? " bad" : ""}`}>
                    {spent}/{room}
                  </span>
                </div>
                {inner === 0 && innerLeft > 0 && canLevel && (
                  <p className="hint">Level the Inner Ring with + to unlock {POINTS_PER_LEVEL} points for these stats.</p>
                )}
                {inner === 0 && !canLevel && headroom < POINTS_PER_LEVEL && <p className="hint">These stats have no room for points.</p>}
                {STAT_GROUPS[g].map((s: StatId) => {
                  const value = valueOf(s);
                  return (
                    <div key={s} className="sheet-stat">
                      <div className="tiny-text">
                        <strong>
                          {title(s)} - {value}
                        </strong>
                        <span className="muted"> max {base[s]?.max ?? 0}</span>
                      </div>
                      <StatLineInput
                        label={title(s)}
                        floor={kindStart(s)}
                        gray={level0(s)}
                        value={value}
                        max={base[s]?.max ?? 0}
                        reach={value + spare}
                        onSet={(v) => setStat(g, s, v)}
                      />
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
