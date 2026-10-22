import { createContext, useContext, useState, type KeyboardEvent, type ReactNode } from "react";
import { STAT_GROUPS, type StatBlock, type StatId } from "../../schema/index.js";
import { kindById, packageById, traitById } from "../content.js";
import { STEPS, type Draft, type Step } from "../draft.js";

export const GROUPS = Object.keys(STAT_GROUPS) as (keyof typeof STAT_GROUPS)[];

export const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const traitName = (id: string) => traitById.get(id)?.name ?? id;

// The package or Trait a choice answer belongs to, by name.
export const askerName = (a: { package?: string; trait?: string }) =>
  a.package !== undefined ? (packageById.get(a.package)?.name ?? a.package) : traitName(a.trait ?? "");

// The Kind's level 0 stats and maximums, straight from content.
export function baseStats(draft: Draft): StatBlock | undefined {
  return draft.kind ? kindById.get(draft.kind)?.stats : undefined;
}

// The engine's errors for the step on screen, as the player should read them.
export const StepErrors = createContext<string[]>([]);

// A step's title, then the site's black stinger with what's wrong on this
// step beside it, then what the step is for.
export function StepHeader({ step, title, children }: { step: Step; title: string; children?: ReactNode }) {
  const errors = useContext(StepErrors);
  return (
    <header className="step-head">
      <h2>{title}</h2>
      <div className="stinger-row">
        <div className="stinger">
          Step {STEPS.indexOf(step) + 1} of {STEPS.length}
        </div>
        {errors.length > 0 && (
          <ul className="issues bad step-issues">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
      {children && <p className="lede">{children}</p>}
    </header>
  );
}

// A selectable card in a radio group, clickable and keyboard-operable. The
// step decides what a second click does; the Kind and package cards clear.
export function Card(props: { selected: boolean; onSelect: () => void; children: ReactNode; label: string; className?: string }) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      props.onSelect();
    }
  };
  return (
    <div
      role="radio"
      aria-checked={props.selected}
      aria-label={props.label}
      tabIndex={0}
      className={`card${props.className ? ` ${props.className}` : ""}${props.selected ? " selected" : ""}`}
      onClick={props.onSelect}
      onKeyDown={onKey}
    >
      {props.children}
    </div>
  );
}

export function Chip(props: { children: ReactNode; tone?: "accent" | "muted" | "bad" }) {
  return <span className={`chip${props.tone ? ` chip-${props.tone}` : ""}`}>{props.children}</span>;
}

const STAT_SLOTS = 20;

// The site's stat bar: circles on odd points, squares on even. Level 0 points
// are gray, points added since are black, room up to the max is open, and
// slots past the max are red.
export function StatLine({ start, value, max }: { start: number; value: number; max: number }) {
  return (
    <div className="stat-line" aria-hidden="true">
      {Array.from({ length: STAT_SLOTS }, (_, n) => {
        const point = n + 1;
        const fill =
          point <= value ? (point > max ? "over" : point <= start ? "default" : "filled") : point <= max ? "empty" : "unavailable";
        return <span key={point} className={`stat ${point % 2 ? "dot" : "square"} ${fill}`} />;
      })}
    </div>
  );
}

// The stat bar as a control. Clicking an open slot fills the stat up to it, as
// far as `reach` allows, and hovering one previews the fill; clicking the last
// filled slot takes a point back. Slots up to `floor` (the Kind's level 0 stat)
// and past the max can't be clicked. Slots up to `gray` are level 0 points.
export function StatLineInput(props: {
  label: string;
  floor: number;
  gray: number;
  value: number;
  max: number;
  reach: number;
  onSet: (value: number) => void;
}) {
  const { label, floor, gray, value, max, reach, onSet } = props;
  const [hover, setHover] = useState(0);
  const top = Math.min(max, reach);
  return (
    <div className="stat-line stat-line-input" role="group" aria-label={`${label}: ${value} of ${max}`} onMouseLeave={() => setHover(0)}>
      {Array.from({ length: STAT_SLOTS }, (_, n) => {
        const point = n + 1;
        const fill =
          point <= value ? (point > max ? "over" : point <= gray ? "default" : "filled") : point <= max ? "empty" : "unavailable";
        const last = point === value && point > floor;
        const enabled = point > floor && point <= max && (point <= value || point <= top);
        const preview = hover > value && point > value && point <= hover;
        return (
          <button
            key={point}
            type="button"
            className={`stat ${point % 2 ? "dot" : "square"} ${fill}${preview ? " preview" : ""}${last && hover === point ? " dropping" : ""}`}
            aria-label={last ? `Take ${label} back to ${point - 1}` : `Set ${label} to ${point}`}
            disabled={!enabled}
            onMouseEnter={() => setHover(enabled ? point : 0)}
            onFocus={() => setHover(enabled ? point : 0)}
            onClick={() => {
              setHover(0);
              onSet(last ? point - 1 : point);
            }}
          />
        );
      })}
    </div>
  );
}

// Start and max for every stat, grouped Physical / Social / Mental.
export function StatRanges({ stats }: { stats: StatBlock }) {
  return (
    <div className="stat-ranges">
      {GROUPS.map((g) => (
        <div key={g}>
          <div className="stat-ranges-group">{title(g)}</div>
          {STAT_GROUPS[g].map((s: StatId) => (
            <div key={s} className="stat-range">
              <span>{title(s)}</span>
              <span className="num">
                {stats[s]?.start}
                <span className="muted">/{stats[s]?.max}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
