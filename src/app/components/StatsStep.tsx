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
// Kind's level 0 stats are already filled in, in gray. A Kind with free level 0
// points, like the AI Core, places them first, on any stat with room.
export function StatsStep({ draft, onChange }: Props) {
  const base = baseStats(draft);
  const free = (draft.kind ? kindById.get(draft.kind)?.freePoints : 0) ?? 0;
  const start = draft.startPoints ?? {};
  const placed = Object.values(start).reduce((n, p) => n + (p ?? 0), 0);
  const innerPlaced = GROUPS.reduce((n, g) => n + draft.inner[g], 0);
  const innerLeft = draft.level - innerPlaced;
  const spentIn = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + (draft.points[s] ?? 0), 0);
  const kindStart = (s: StatId) => base?.[s]?.start ?? 0;
  const level0 = (s: StatId) => kindStart(s) + (start[s] ?? 0);

  const setStart = (stat: StatId, value: number) => {
    const startPoints = { ...start, [stat]: value - kindStart(stat) };
    if (!startPoints[stat]) delete startPoints[stat];
    onChange({ ...draft, startPoints });
  };

  const setPoints = (stat: StatId, value: number) => {
    const points = { ...draft.points, [stat]: value - level0(stat) };
    if (!points[stat]) delete points[stat];
    onChange({ ...draft, points });
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
        Each level gives an Inner Ring point. Put it in Physical, Social or Mental to unlock {POINTS_PER_LEVEL} Outer Ring points, then click a stat's bar to
        fill it in. Your Kind's level 0 stats are already filled in, in gray.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
        <p className="pool-summary">
          <span className={`num${innerLeft === 0 ? " good" : innerLeft < 0 ? " bad" : ""}`}>
            {innerPlaced}/{draft.level}
          </span>{" "}
          Inner Ring points placed
          {innerLeft > 0 && <span className="muted"> · {innerLeft} left</span>}
        </p>

        {free > 0 && (
          <div className="pool-level0">
            <div className="sheet-group-head">
              <h4 className="rule">Level 0 points</h4>
              <span className={`num${placed === free ? " good" : ""}`}>
                {placed}/{free}
              </span>
            </div>
            <p className="hint">Your Kind gives {free} points to place in any stats it allows, before level 1.</p>
            <div className="pool-stats">
              {GROUPS.map((g) => (
                <div key={g} className="sheet-group">
                  <h5 className="pool-group-name">{title(g)}</h5>
                  {STAT_GROUPS[g].map((s: StatId) => (
                    <PoolStat
                      key={s}
                      stat={s}
                      start={kindStart(s)}
                      value={level0(s)}
                      max={base[s]?.max ?? 0}
                      reach={level0(s) + free - placed}
                      onSet={(v) => setStart(s, v)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pool-stats">
          {GROUPS.map((g) => {
            const inner = draft.inner[g];
            const room = inner * POINTS_PER_LEVEL;
            const spent = spentIn(g);
            const locked = inner === 0;
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
                  <span className={`num${locked ? " muted" : spent === room ? " good" : spent > room ? " bad" : ""}`}>
                    {spent}/{room}
                  </span>
                </div>
                {locked && <p className="hint">Put an Inner Ring point here to unlock {POINTS_PER_LEVEL} points for these stats.</p>}
                {STAT_GROUPS[g].map((s: StatId) => {
                  const value = level0(s) + (draft.points[s] ?? 0);
                  return (
                    <PoolStat
                      key={s}
                      stat={s}
                      start={level0(s)}
                      value={value}
                      max={base[s]?.max ?? 0}
                      reach={locked ? 0 : value + room - spent}
                      onSet={(v) => setPoints(s, v)}
                    />
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

// One stat's name, value and max over its bar, as on the sheet.
function PoolStat(props: { stat: StatId; start: number; value: number; max: number; reach: number; onSet: (value: number) => void }) {
  const { stat, start, value, max, reach, onSet } = props;
  return (
    <div className="sheet-stat">
      <div className="tiny-text">
        <strong>
          {title(stat)} - {value}
        </strong>
        <span className="muted"> max {max}</span>
      </div>
      <StatLineInput label={title(stat)} start={start} value={value} max={max} reach={reach} onSet={onSet} />
    </div>
  );
}
