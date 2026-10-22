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
// Clicking a bar spends what it can, in order: the Kind's free level 0 points
// (the AI Core's 3), then the group's unlocked points, then new Inner Ring
// points for the group while the level has some left. Taking points back
// returns the group's points first, then the free ones; Inner Ring points stay
// put until the player takes them back with −.
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
    let inner = draft.inner[g];
    const value = valueOf(s);
    if (target > value) {
      let need = target - value;
      const fromFree = Math.min(need, Math.max(0, freeLeft));
      need -= fromFree;
      const roomLeft = Math.max(0, inner * POINTS_PER_LEVEL - spentIn(g));
      const added = Math.min(Math.max(0, innerLeft), Math.ceil(Math.max(0, need - roomLeft) / POINTS_PER_LEVEL));
      inner += added;
      const fromGroup = Math.min(need, roomLeft + added * POINTS_PER_LEVEL);
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
    onChange({ ...draft, startPoints, points, inner: { ...draft.inner, [g]: inner } });
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
        Each level gives an Inner Ring point, and each Inner Ring point unlocks {POINTS_PER_LEVEL} Outer Ring points for its group's stats. Click a stat's bar to
        fill it in; a group without points to spare takes another Inner Ring point. Your Kind's level 0 stats are already filled in, in gray.
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
            const spare = Math.max(0, freeLeft) + Math.max(0, room - spent) + Math.max(0, innerLeft) * POINTS_PER_LEVEL;
            const locked = spare === 0 && spent === 0 && inner === 0;
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
                    <button aria-label={`Put an Inner Ring point in ${g}`} onClick={() => onChange(withInner(draft, g, inner + 1))} disabled={innerLeft <= 0}>
                      +
                    </button>
                  </div>
                  <h4 className="rule">{title(g)}</h4>
                  <span className={`num${inner === 0 ? " muted" : spent === room ? " good" : spent > room ? " bad" : ""}`}>
                    {spent}/{room}
                  </span>
                </div>
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
