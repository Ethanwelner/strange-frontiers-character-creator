import type { StatGroup } from "../../engine/build.js";
import { bonusPointsOf, MP_PER_MAGIC, FOCUS_POINTS_PER_LEVEL as POINTS_PER_LEVEL } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { coreAccessFor, coreStatsShown } from "../check.js";
import { content, kindById, packageById } from "../content.js";
import { withCore, type Draft } from "../draft.js";
import { baseStats, CoreLine, GROUPS, Sign, StatLine, StepHeader, title } from "./ui.js";

interface Props {
  draft: Draft;
  onChange: (d: Draft) => void;
}

// Stats as a pool, drawn like the character sheet. Each core point (one
// per level) goes to a group and unlocks 3 focus points for that group's
// stats, which the player adds with each stat's + and −. The stats' circle and
// square bars show the result: the Kind's bonus in purple, then the player's
// points in green.
//
// A group's stats only take points its core stat has unlocked, so the player
// levels the core stat first, with +. A stat's + spends free bonus points
// first, if there are any it can take (an Origin's in its group, like the
// American Empire's 1 Physical point, then the Kind's in any stat; they need
// no core point), then the group's unlocked points. Taking a point back returns the group's points first,
// then the free ones; core points stay put until the player takes them
// back with −, which also takes back any focus points the group can no
// longer hold. A group can't take a core point its stats have no room
// for, like an AI Core's Physical, where every max is 0.
//
// Magic, for characters who can level it, has no focus stats: each core
// point in it adds MP instead.
export function StatsStep({ draft, onChange }: Props) {
  const base = baseStats(draft);
  // Free bonus points: the Origin's and other packages', each in its group,
  // and the Kind's, in any stat.
  const packages = [draft.origin, draft.profession, draft.past].flatMap((id) => (id && packageById.get(id) ? [packageById.get(id)!] : []));
  const bonus = bonusPointsOf(draft.kind ? kindById.get(draft.kind) : undefined, packages);
  const start = draft.startPoints ?? {};
  const placedIn = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + (start[s] ?? 0), 0);
  const needIn = (g: StatGroup) => bonus.groups.find((b) => b.group === g)?.count ?? 0;
  const inGroups = bonus.groups.reduce((n, b) => n + Math.min(placedIn(b.group), b.count), 0);
  const placed = Object.values(start).reduce((n, p) => n + (p ?? 0), 0);
  const anyLeft = Math.max(0, bonus.any - (placed - inGroups));
  // Free points a group's stats can still take: its own, then the Kind's
  const freeFor = (g: StatGroup) => Math.max(0, needIn(g) - placedIn(g)) + anyLeft;
  const groupOf = (s: StatId) => (Object.keys(STAT_GROUPS) as StatGroup[]).find((g) => STAT_GROUPS[g].includes(s))!;
  const corePlaced = GROUPS.reduce((n, g) => n + draft.core[g], 0);
  const coreLeft = draft.level - corePlaced;
  const shown = coreStatsShown(draft, content);
  const open = coreAccessFor(draft, content);
  const spentIn = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + (draft.points[s] ?? 0), 0);
  const kindBonus = (s: StatId) => base?.[s]?.bonus ?? 0;
  // The Kind's bonus plus any free bonus points placed on the stat
  const bonusOf = (s: StatId) => kindBonus(s) + (start[s] ?? 0);
  const valueOf = (s: StatId) => bonusOf(s) + (draft.points[s] ?? 0);

  // One point on or off a stat: on from the free bonus points while any are
  // left, otherwise from the group's unlocked points; off from the group's
  // points first.
  const bump = (s: StatId, by: 1 | -1) => {
    const startPoints = { ...start };
    const points = { ...draft.points };
    if (by > 0) {
      if (freeFor(groupOf(s)) > 0) startPoints[s] = (startPoints[s] ?? 0) + 1;
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
        <p className="empty">Choose a Kind first; it adds a bonus to each stat and sets how far each can go.</p>
      </section>
    );
  }

  return (
    <section>
      <StepHeader step="stats" title="Stats">
        Each level gives a core point. Level a group's core stat with the + beside its number to unlock {POINTS_PER_LEVEL} focus points for its
        stats, then spend them with each stat's +. A group's stats can't take points until its core stat is leveled. Your stats start at 0, and your Kind's bonus
        is added on top, in purple; your points show in green.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
        <p className="pool-summary">
          <span className={`num${coreLeft === 0 ? " good" : coreLeft < 0 ? " bad" : ""}`}>
            {corePlaced}/{draft.level}
          </span>{" "}
          core points placed
          {coreLeft > 0 && <span className="muted"> · {coreLeft} left</span>}
          {bonus.groups.map((b) => (
            <span key={b.group}>
              {" · "}
              <span className={`num${placedIn(b.group) >= b.count ? " good" : ""}`}>
                {Math.min(placedIn(b.group), b.count)}/{b.count}
              </span>{" "}
              {title(b.group)} bonus {b.count === 1 ? "point" : "points"} placed
              <span className="muted"> (from {b.from.join(" and ")}, spent first)</span>
            </span>
          ))}
          {bonus.any > 0 && (
            <>
              {" · "}
              <span className={`num${anyLeft === 0 ? " good" : ""}`}>
                {bonus.any - anyLeft}/{bonus.any}
              </span>{" "}
              free bonus points placed
              <span className="muted"> (spent first, on any stat)</span>
            </>
          )}
        </p>

        <div className="pool-stats">
          {shown.map((g) => {
            const core = draft.core[g];
            const room = core * POINTS_PER_LEVEL;
            const spent = spentIn(g);
            if (!STAT_GROUPS[g].length) {
              const canLevel = coreLeft > 0 && open.includes(g);
              // A package's bonus, like the Licensed Mage's 1 Magic, on top of the levels
              const extra = open.includes(g) ? packages.reduce((n, p) => n + (p.coreBonus[g as "magic"] ?? 0), 0) : 0;
              return (
                <div key={g} className={`sheet-group${core === 0 && !canLevel ? " locked" : ""}`}>
                  <div className="sheet-group-head">
                    <div className="core-control">
                      <span className="stat-badge" title="Core stat">
                        {core + extra}
                      </span>
                      <button aria-label={`Take a core point from ${g}`} onClick={() => onChange(withCore(draft, g, core - 1))} disabled={core === 0}>
                        <Sign is="minus" />
                      </button>
                      <button
                        aria-label={`Put a core point in ${g}`}
                        title={coreLeft > 0 && !open.includes(g) ? `This character can't level ${title(g)}` : undefined}
                        onClick={() => onChange(withCore(draft, g, core + 1))}
                        disabled={!canLevel}
                      >
                        <Sign is="plus" />
                      </button>
                    </div>
                    <h4 className="rule">{title(g)}</h4>
                    <span className={`num${core + extra === 0 ? " muted" : ""}`}>{MP_PER_MAGIC * (core + extra)} MP</span>
                  </div>
                  {/* A diamond per point, under the core's − and +, which already set it */}
                  <div className="sheet-stat">
                    <div className="tiny-text">
                      <strong>
                        Each point in {title(g)} adds {MP_PER_MAGIC} MP (Mana Points)
                      </strong>
                    </div>
                    <CoreLine bonus={extra} value={core + extra} />
                  </div>
                  {!open.includes(g) && <p className="hint">This character can't level {title(g)}; take these points back.</p>}
                </div>
              );
            }
            // Points any of this group's stats could still take.
            const spare = freeFor(g) + Math.max(0, room - spent);
            const locked = spare === 0 && spent === 0;
            // Room left under the group's maxes, after the points already unlocked.
            const headroom = STAT_GROUPS[g].reduce((n, s) => n + Math.max(0, (base[s]?.max ?? 0) - valueOf(s)), 0) - Math.max(0, room - spent);
            const canLevel = coreLeft > 0 && headroom >= POINTS_PER_LEVEL;
            // Focus points that taking a core point back also takes back
            const stranded = Math.max(0, spent - (core - 1) * POINTS_PER_LEVEL);
            return (
              <div key={g} className={`sheet-group${locked ? " locked" : ""}`}>
                <div className="sheet-group-head">
                  <div className="core-control">
                    <span className="stat-badge" title="Core stat">
                      {core}
                    </span>
                    <button
                      aria-label={`Take a core point from ${g}`}
                      title={core > 0 && stranded ? `Also takes back ${stranded} focus ${stranded === 1 ? "point" : "points"}` : undefined}
                      onClick={() => onChange(withCore(draft, g, core - 1))}
                      disabled={core === 0}
                    >
                      <Sign is="minus" />
                    </button>
                    <button
                      aria-label={`Put a core point in ${g}`}
                      title={coreLeft > 0 && !canLevel ? `${title(g)}'s stats have no room for ${POINTS_PER_LEVEL} more points` : undefined}
                      onClick={() => onChange(withCore(draft, g, core + 1))}
                      disabled={!canLevel}
                    >
                      <Sign is="plus" />
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
                  // The group's unspent points this stat can still take under its max
                  const toSpend = Math.max(0, Math.min(spare, max - value));
                  return (
                    <div key={s} className="sheet-stat">
                      <div className="tiny-text">
                        <strong>
                          {title(s)} - {value}
                        </strong>
                        {toSpend > 0 && (
                          <span className="stat-spend muted">
                            Spend {toSpend} {toSpend === 1 ? "point" : "points"}
                          </span>
                        )}
                      </div>
                      <div className="pool-stat-row">
                        <div className="stat-buttons">
                          <button aria-label={`Take a point from ${s}`} onClick={() => bump(s, -1)} disabled={value <= kindBonus(s)}>
                            <Sign is="minus" />
                          </button>
                          <button aria-label={`Add a point to ${s}`} onClick={() => bump(s, 1)} disabled={spare === 0 || value >= max}>
                            <Sign is="plus" />
                          </button>
                        </div>
                        <StatLine bonus={bonusOf(s)} value={value} max={max} />
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
