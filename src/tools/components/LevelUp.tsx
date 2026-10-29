import { useState } from "react";
import type { StatGroup } from "../../engine/build.js";
import { FOCUS_POINTS_PER_LEVEL, MP_PER_MAGIC, type BuildResult } from "../../engine/validate.js";
import { STAT_CAP, STAT_GROUPS, type StatId } from "../../schema/index.js";
import { baseStats, CoreLine, Notice, Sign, StatLine, title } from "../../app/components/ui.js";
import { TraitsStep } from "../../app/components/TraitsStep.js";
import type { Play } from "../play.js";

// A level up, as the rules have it: one core point in a core stat the
// character can level, then, for Physical, Social or Mental, 3 focus points
// among that core stat's focus stats. New picks come from the points, and
// are spent below with the Character Creator's own Traits step.
export function LevelUp({ play, result, onChange }: { play: Play; result: BuildResult; onChange: (p: Play) => void }) {
  const { draft } = play;
  const summary = result.summary;
  const [group, setGroup] = useState<StatGroup>();
  const [alloc, setAlloc] = useState<Partial<Record<StatId, number>>>({});
  const [done, setDone] = useState<number>();

  if (!summary) {
    return (
      <section>
        <header className="step-head">
          <h2>Level Up</h2>
        </header>
        <div className="notice bad">The engine couldn't read this character, so it can't level up. Check the Sheet tab.</div>
      </section>
    );
  }

  const base = baseStats(draft);
  const stats = group ? STAT_GROUPS[group] : [];
  const needed = stats.length ? FOCUS_POINTS_PER_LEVEL : 0;
  const placed = Object.values(alloc).reduce((n, p) => n + (p ?? 0), 0);
  const maxOf = (s: StatId) => Math.min(base?.[s]?.max ?? STAT_CAP, STAT_CAP);
  const bump = (s: StatId, by: 1 | -1) => {
    const next = (alloc[s] ?? 0) + by;
    setAlloc({ ...alloc, [s]: Math.max(0, next) });
  };
  // A group with no room left in any stat can't take the level.
  const roomIn = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + Math.max(0, maxOf(s) - summary.stats[s]), 0);

  const levelUp = () => {
    if (!group) return;
    const points = { ...draft.points };
    for (const [s, n] of Object.entries(alloc) as [StatId, number][]) {
      if (n) points[s] = (points[s] ?? 0) + n;
    }
    onChange({ ...play, draft: { ...draft, level: draft.level + 1, core: { ...draft.core, [group]: draft.core[group] + 1 }, points } });
    setDone(draft.level + 1);
    setGroup(undefined);
    setAlloc({});
  };

  const picks = summary.picks;
  const banked = picks.universal.banked + picks.background.banked;

  return (
    <section className="tools-level">
      <header className="step-head">
        <h2>Level Up</h2>
        <p className="lede">
          Level {draft.level} now. Each level is one core point, plus three focus points to spread across that core stat's focus stats. Odd points on a stat's bar
          give a universal pick and even points a background pick.
        </p>
      </header>

      {done !== undefined && (
        <Notice fades onDismiss={() => setDone(undefined)}>
          {`Level ${done}. ${banked ? `${banked} ${banked === 1 ? "pick" : "picks"} to spend below.` : "No new picks this time."}`}
        </Notice>
      )}

      <h3 className="subhead">1. Core stat</h3>
      <div className="tools-groups" role="radiogroup" aria-label="Core stat to level">
        {summary.coreAccess.map((g) => {
          const full = STAT_GROUPS[g].length > 0 && roomIn(g) < FOCUS_POINTS_PER_LEVEL;
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={group === g}
              className={`tools-group${group === g ? " is-active" : ""}`}
              disabled={full}
              onClick={() => {
                setGroup(g);
                setAlloc({});
              }}
            >
              <strong>{title(g)}</strong> <span className="muted">{summary.coreStats[g]} → {summary.coreStats[g] + 1}</span>
              {full && <span className="small bad"> no room</span>}
            </button>
          );
        })}
      </div>

      {group && (
        <>
          <h3 className="subhead">2. Focus points {needed ? `(${placed} of ${needed})` : ""}</h3>
          {!needed ? (
            <div className="sheet-stat">
              <p>
                {title(group)} has no focus stats: the point adds {MP_PER_MAGIC} MP.
              </p>
              <CoreLine bonus={summary.coreBonus[group]} value={summary.coreStats[group] + 1} />
            </div>
          ) : (
            <div className="tools-focus">
              {stats.map((s) => {
                const now = summary.stats[s];
                const add = alloc[s] ?? 0;
                const max = maxOf(s);
                return (
                  <div key={s} className="sheet-stat tools-focus-stat">
                    <div className="tiny-text">
                      <strong>
                        {title(s)} - {now + add}
                      </strong>
                      <span className="muted"> max {max}</span>
                    </div>
                    <div className="tools-focus-row">
                      <StatLine bonus={now} value={now + add} max={max} />
                      <div className="stepper">
                        <button type="button" onClick={() => bump(s, -1)} disabled={add <= 0} aria-label={`Take a point off ${title(s)}`}>
                          <Sign is="minus" />
                        </button>
                        <span className="num">+{add}</span>
                        <button type="button" onClick={() => bump(s, 1)} disabled={placed >= needed || now + add >= max} aria-label={`Put a point in ${title(s)}`}>
                          <Sign is="plus" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p>
            <button type="button" className="build-button" disabled={placed !== needed} onClick={levelUp}>
              Level up to {draft.level + 1}
            </button>
          </p>
        </>
      )}

      <h3 className="subhead">3. Spend picks</h3>
      <p className="hint">
        {picks.universal.banked} universal and {picks.background.banked} background {banked === 1 ? "pick" : "picks"} banked. Banking them for later is fine.
      </p>
      {result.errors.length > 0 && (
        <ul className="issues bad">
          {result.errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}
      <div className="tools-picks">
        <TraitsStep draft={draft} campaign={{ startingLevel: draft.level }} result={result} onChange={(d) => onChange({ ...play, draft: d })} />
      </div>
    </section>
  );
}
