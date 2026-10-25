import { createContext, useContext, useState, type KeyboardEvent, type ReactNode } from "react";
import { MAX_LEVEL } from "../../ai/level.js";
import { STAT_GROUPS, type StatBlock, type StatId } from "../../schema/index.js";
import { kindById, packageById, traitById } from "../content.js";
import { STEPS, type Draft, type Step } from "../draft.js";

export const GROUPS = Object.keys(STAT_GROUPS) as (keyof typeof STAT_GROUPS)[];

export const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const traitName = (id: string) => traitById.get(id)?.name ?? id;

// A card's header bar color, the same for every card: anything from Isekai
// gets Dreft's green, and the rest (Earth and any plane) the Systems gray.
export const regionClass = (plane: string | undefined) => `region-${plane === "isekai" ? "dreft" : "systems"}`;
export const traitRegionClass = (id: string) => regionClass(traitById.get(id)?.plane);

// A choice with no note of its own, in the notes' shorthand: "+1 Spoken Language".
export const choiceLabel = (count: number, pool: string) =>
  `+${count} ${pool.split("-").map(title).join(" ")}`;

// The setting mark at the start of a card's name: Isekai's for anything from
// Isekai, The Systems' for anything from Earth. Generic cards (plane "any")
// get none.
const SETTINGS: Record<string, { mark: string; name: string }> = {
  isekai: { mark: "isekai", name: "Isekai" },
  earth: { mark: "systems", name: "The Systems" },
};

export function SettingIcon({ plane }: { plane: string | undefined }) {
  const setting = plane ? SETTINGS[plane] : undefined;
  if (!setting) return null;
  return <span className={`setting-icon setting-${setting.mark}`} role="img" aria-label={setting.name} title={setting.name} />;
}

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
        <div className="copy stinger black">
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

// The character's name, which turns into a field when it or the pen at the
// end of its line is clicked. Enter or leaving the field keeps the change;
// Escape drops it. The Sheet and the character box both use it.
export function NameField({
  name,
  onChange,
  heading: Heading,
  className,
}: {
  name?: string;
  onChange: (name?: string) => void;
  heading: "h2" | "h3";
  className: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const start = () => {
    setValue(name ?? "");
    setEditing(true);
  };
  const finish = (keep: boolean) => {
    if (keep) onChange(value.trim() || undefined);
    setEditing(false);
  };
  return (
    <div className={`name-field-line ${className}`}>
      <Heading>
        {editing ? (
          <input
            className="name-input"
            aria-label="Character name"
            value={value}
            maxLength={80}
            placeholder="Unnamed character"
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => finish(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") finish(true);
              if (e.key === "Escape") finish(false);
            }}
          />
        ) : (
          <button type="button" className={`name-text${name ? "" : " muted"}`} onClick={start}>
            {name || "Unnamed character"}
          </button>
        )}
      </Heading>
      <button
        type="button"
        className="name-edit"
        aria-label="Edit the name"
        // Keeps the field from losing focus first, so the pen doesn't reopen it
        onMouseDown={(e) => editing && e.preventDefault()}
        onClick={() => (editing ? finish(true) : start())}
      >
        <span className="pen-icon" aria-hidden="true" />
      </button>
    </div>
  );
}

// A level from 1 to MAX_LEVEL: its label over − and + around the number. The
// describe box and the Character step both use it.
export function LevelStepper({
  label,
  level,
  onChange,
  disabled,
  className = "",
}: {
  label: string;
  level: number;
  onChange: (level: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`level-stepper ${className}`}>
      <span className="field-label">{label}</span>
      <div className="stepper">
        <button type="button" onClick={() => onChange(Math.max(1, level - 1))} disabled={disabled || level <= 1} aria-label="Lower level">
          −
        </button>
        <span className="num" aria-live="polite">
          {level}
        </span>
        <button type="button" onClick={() => onChange(Math.min(MAX_LEVEL, level + 1))} disabled={disabled || level >= MAX_LEVEL} aria-label="Raise level">
          +
        </button>
      </div>
    </div>
  );
}
