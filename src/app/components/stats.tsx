import { useRef, type ReactNode } from "react";
import type { StatGroup } from "../../engine/build.js";
import { MP_PER_MAGIC, type BuildResult } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { Button } from "./Button.js";
import { coreStatsShown } from "../check.js";
import { content } from "../content.js";
import type { Draft } from "../draft.js";
import { baseStats, Icon, Sign, title } from "./ui.js";

// The stat block: each core stat (Physical, Social, Mental, and Magic for a
// character who can level it) with its badge and ruled title, then each focus
// stat's name and number over its bar of 20 slots. One component, so the
// stats can't drift between the places that draw them.
//
// Player Tools' sheet is the reference. The creator's Stats step and Sheet
// draw this component too, and the site draws the same markup from
// php/rpg/components/stats.php (sf_stat_block), styled by the same
// stylesheet: src/app/stats.css here, css/sf-stats.css (a copy) there.
//
// The block takes options that say what it does where it's drawn, under the
// same names on both sides:
//
//   max   each stat's maximum beside its number ("max 15"): the creator's
//         Sheet and the site's sample sheet
//   edit  the − and + on each core stat and focus stat, how many points a
//         stat can still take, each group's count of points spent, and its
//         hints, with groups that can't take points faded: the creator's
//         Stats step and Player Tools' level up
//
// Without either, it's the plain block: Player Tools' sheet and the site's
// example stats. The site's pages are static, so edit doesn't exist there.
//
// A bar's slots are circles on odd points and squares on even (diamonds for
// Magic, which has no focus stats): bonus points first (the Kind's and the
// packages', a dark shade of the group's color), then the player's (the full
// color), then open slots up to the max, then faded slots past it. A point
// past the max is red.

export const STAT_SLOTS = 20;

// A focus stat as the block draws it
export interface BlockStat {
  id: StatId;
  value: number;
  // Bonus points (the Kind's, and any free bonus points placed), drawn first
  bonus: number;
  max: number;
}

// A core stat and its focus stats. Magic has none: its bar is its own points,
// with any package bonus (like the Licensed Mage's) first.
export interface BlockGroup {
  group: StatGroup;
  core: number;
  stats: BlockStat[];
  bonus?: number;
}

// A − or + on the block
export interface StatStep {
  onClick: () => void;
  disabled: boolean;
  title?: string;
}

// The edit option: the controls for each core stat and focus stat
export interface StatBlockEdit {
  core: (g: StatGroup) => {
    take: StatStep;
    put: StatStep;
    // Beside the title: points spent of those unlocked, or Magic's MP
    count: { text: string; tone?: "good" | "bad" | "muted" | "mp" };
    // Can't take points: faded
    locked?: boolean;
    hint?: ReactNode;
  };
  stat: (s: StatId) => { take: StatStep; put: StatStep; spend: number };
}

// What a stat bar held before its value last changed, so the points just
// added can pop in (.is-new). It starts at the value, so nothing pops when
// the bar first draws, and it holds until the value changes again, so other
// re-renders don't cut a pop short.
function useAddedFrom(value: number): number {
  const seen = useRef({ value, from: value });
  if (seen.current.value !== value) {
    seen.current = { value, from: seen.current.value };
  }
  return seen.current.from;
}

// A focus stat's bar
export function StatBar({ bonus, value, max }: { bonus: number; value: number; max: number }) {
  const from = useAddedFrom(value);
  return (
    <div className="sf-stat-line" aria-hidden="true">
      {Array.from({ length: STAT_SLOTS }, (_, n) => {
        const point = n + 1;
        const fill = point <= value ? (point > max ? "over" : point <= bonus ? "bonus" : "filled") : point <= max ? "empty" : "unavailable";
        const added = fill === "filled" && point > from ? " is-new" : "";
        return <span key={point} className={`sf-stat-slot sf-stat-slot--${point % 2 ? "dot" : "square"} is-${fill}${added}`} />;
      })}
    </div>
  );
}

// Magic's bar: a diamond per point, any bonus first. No Kind sets a Magic
// maximum, so every slot past the points is open.
export function CoreBar({ bonus = 0, value }: { bonus?: number; value: number }) {
  const from = useAddedFrom(value);
  return (
    <div className="sf-stat-line" aria-hidden="true">
      {Array.from({ length: STAT_SLOTS }, (_, n) => (
        <span key={n} className={`sf-stat-slot sf-stat-slot--diamond is-${n < bonus ? "bonus" : n < value ? `filled${n >= from ? " is-new" : ""}` : "empty"}`} />
      ))}
    </div>
  );
}

// A character's stats from its check, as a sheet shows them: the core stats
// it has or can level, and each focus stat with the Kind's bonus and any
// free bonus points placed counted as bonus points. An AI Core's Physical
// stats are its inhabited chassis's, with no room past them: no Level can
// raise them.
export function sheetStatGroups(draft: Draft, result: BuildResult): BlockGroup[] {
  const base = baseStats(draft);
  const summary = result.summary;
  return coreStatsShown(draft, content, result).map((g) => ({
    group: g,
    core: summary?.coreStats[g] ?? draft.core[g],
    bonus: summary?.coreBonus[g] ?? 0,
    stats: STAT_GROUPS[g].map((s: StatId) => {
      // Points can't go into them, so past the chassis's numbers the slots
      // are unavailable, as an AI Core's own Physical slots are
      if (summary?.chassis && g === "physical") return { id: s, value: summary.stats[s], bonus: 0, max: summary.stats[s] };
      const bonus = (base?.[s]?.bonus ?? 0) + (draft.startPoints?.[s] ?? 0);
      return { id: s, value: summary?.stats[s] ?? bonus, bonus, max: base?.[s]?.max ?? 0 };
    }),
  }));
}

// A − or +: the creator's green, glitching, while it can be used
function StepButton({ step, label, plus }: { step: StatStep; label: string; plus?: boolean }) {
  return (
    <Button
      round="sm"
      tone={step.disabled ? "gray" : "primary"}
      ready={!step.disabled}
      className={plus ? "is-plus" : undefined}
      aria-label={label}
      title={step.title}
      onClick={step.onClick}
      disabled={step.disabled}
    >
      <Sign is={plus ? "plus" : "minus"} />
    </Button>
  );
}

export function StatBlock({ groups, max = false, edit }: { groups: BlockGroup[]; max?: boolean; edit?: StatBlockEdit }) {
  return (
    <div className={`sf-stats${edit ? " sf-stats--edit" : ""}`}>
      {groups.map(({ group: g, core, stats, bonus = 0 }) => {
        const control = edit?.core(g);
        return (
          <div key={g} className={`sf-stat-group sf-stat-group--${g}${control?.locked ? " is-locked" : ""}`}>
            <div className="sf-stat-group-head">
              <div className="sf-stat-core">
                <span className="sf-stat-badge" title="Core Stat">
                  <Icon name={g} className="sf-stat-badge-icon" />
                </span>
                {control && (
                  <>
                    <StepButton step={control.take} label={`Take a core point from ${g}`} />
                    <StepButton step={control.put} label={`Put a core point in ${g}`} plus />
                  </>
                )}
              </div>
              <h4 className="sf-stat-group-title">
                {title(g)} - {core}
              </h4>
              {control && <span className={`sf-stat-group-count num${control.count.tone ? ` is-${control.count.tone}` : ""}`}>{control.count.text}</span>}
            </div>
            {control?.hint && <p className="sf-stat-hint">{control.hint}</p>}
            {/* Magic: a diamond per point */}
            {!STAT_GROUPS[g].length && (
              <div className="sf-stat">
                <div className="sf-stat-label">
                  <strong>
                    Each point in {title(g)} adds {MP_PER_MAGIC} MP (Mana Points)
                  </strong>
                </div>
                <CoreBar bonus={bonus} value={core} />
              </div>
            )}
            {stats.map((s) => {
              const step = edit?.stat(s.id);
              return (
                <div key={s.id} className="sf-stat">
                  <div className="sf-stat-label">
                    <strong>
                      {title(s.id)} - {s.value}
                    </strong>
                    {max && <span className="sf-stat-max"> max {s.max}</span>}
                    {step && step.spend > 0 && (
                      <span className="sf-stat-spend">
                        Spend {step.spend} {step.spend === 1 ? "point" : "points"}
                      </span>
                    )}
                  </div>
                  {step ? (
                    <div className="sf-stat-row">
                      <div className="sf-stat-steps">
                        <StepButton step={step.take} label={`Take a point from ${s.id}`} />
                        <StepButton step={step.put} label={`Add a point to ${s.id}`} plus />
                      </div>
                      <StatBar bonus={s.bonus} value={s.value} max={s.max} />
                    </div>
                  ) : (
                    <StatBar bonus={s.bonus} value={s.value} max={s.max} />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
