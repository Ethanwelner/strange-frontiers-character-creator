import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MAX_LEVEL } from "../../ai/level.js";
import { STAT_GROUPS, type StatBlock, type StatId } from "../../schema/index.js";
import { kindById, packageById, traitById } from "../content.js";
import { STEPS, type Draft, type Step } from "../draft.js";

export const GROUPS = Object.keys(STAT_GROUPS) as (keyof typeof STAT_GROUPS)[];
// The core stats with focus stats: every one but Magic.
export const FOCUS_GROUPS = GROUPS.filter((g) => STAT_GROUPS[g].length > 0);

export const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const traitName = (id: string) => traitById.get(id)?.name ?? id;

// A card's header bar color, the same for every card: anything from Isekai
// gets Dreft's green, and the rest (Earth and any plane) the Settled Systems gray.
export const regionClass = (plane: string | undefined) => `region-${plane === "isekai" ? "dreft" : "systems"}`;
export const traitRegionClass = (id: string) => regionClass(traitById.get(id)?.plane);

// A choice with no note of its own, in the notes' shorthand: "+1 Spoken Language".
export const choiceLabel = (count: number, pool: string) =>
  `+${count} ${pool.split("-").map(title).join(" ")}`;

// The setting mark at the start of a card's name: Isekai's for anything from
// Isekai, The Settled Systems' for anything from Earth. Generic cards (plane "any")
// get none.
const SETTINGS: Record<string, { mark: string; name: string }> = {
  isekai: { mark: "isekai", name: "Isekai" },
  earth: { mark: "systems", name: "The Settled Systems" },
};

export function SettingIcon({ plane }: { plane: string | undefined }) {
  const setting = plane ? SETTINGS[plane] : undefined;
  if (!setting) return null;
  return <span className={`setting-icon setting-${setting.mark}`} role="img" aria-label={setting.name} title={setting.name} />;
}

// The package or Trait a choice answer belongs to, by name.
export const askerName = (a: { package?: string; trait?: string }) =>
  a.package !== undefined ? (packageById.get(a.package)?.name ?? a.package) : traitName(a.trait ?? "");

// The Kind's stat bonuses and maximums, straight from content.
export function baseStats(draft: Draft): StatBlock | undefined {
  return draft.kind ? kindById.get(draft.kind)?.stats : undefined;
}

// A step's title, then the site's black stinger, then what the step is for.
// What's wrong on the step shows beside the next step button (App.tsx).
export function StepHeader({ step, title, children }: { step: Step; title: string; children?: ReactNode }) {
  return (
    <header className="step-head">
      <h2>{title}</h2>
      <div className="stinger-row">
        <div className="copy stinger black">
          Step {STEPS.indexOf(step) + 1} of {STEPS.length}
        </div>
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

// How long a passing notice, like "Imported grosh.json.", stays before it
// fades out, and how long the fade takes (.notice.is-leaving in styles.css).
const NOTICE_MS = 5000;
const NOTICE_FADE_MS = 400;

// A notice with a dismiss button. One that `fades` goes away on its own after
// 5 seconds; errors stay until the player dismisses them. A new message
// starts the wait over, so the message is one string.
export function Notice({ children, fades, onDismiss }: { children: string; fades?: boolean; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    setLeaving(false);
    if (!fades) return;
    const fade = setTimeout(() => setLeaving(true), NOTICE_MS);
    const gone = setTimeout(() => dismiss.current(), NOTICE_MS + NOTICE_FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [children, fades]);
  return (
    <div className={`notice${leaving ? " is-leaving" : ""}`} role="status">
      {children}
      <button className="link" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

export function Chip(props: { children: ReactNode; tone?: "accent" | "muted" | "bad" }) {
  return <span className={`chip${props.tone ? ` chip-${props.tone}` : ""}`}>{props.children}</span>;
}

const STAT_SLOTS = 20;

// The site's stat bar: circles on odd points, squares on even. The Kind's
// bonus is gray, the player's points after it are black, room up to the max
// is open, and slots past the max are red.
export function StatLine({ bonus, value, max }: { bonus: number; value: number; max: number }) {
  return (
    <div className="stat-line" aria-hidden="true">
      {Array.from({ length: STAT_SLOTS }, (_, n) => {
        const point = n + 1;
        const fill =
          point <= value ? (point > max ? "over" : point <= bonus ? "default" : "filled") : point <= max ? "empty" : "unavailable";
        return <span key={point} className={`stat ${point % 2 ? "dot" : "square"} ${fill}`} />;
      })}
    </div>
  );
}

// A core stat with no focus stats, like Magic: a diamond per point, out of 20,
// with any bonus from a package (gray, or purple on the dark sheet) first. No
// Kind sets a Magic maximum, so every slot past the points is open.
export function CoreLine({ bonus = 0, value }: { bonus?: number; value: number }) {
  return (
    <div className="stat-line" aria-hidden="true">
      {Array.from({ length: STAT_SLOTS }, (_, n) => (
        <span key={n} className={`stat diamond ${n < bonus ? "default" : n < value ? "filled" : "empty"}`} />
      ))}
    </div>
  );
}

// The Kind's bonus and max for every stat, grouped Physical / Social / Mental.
export function StatRanges({ stats }: { stats: StatBlock }) {
  return (
    <div className="stat-ranges">
      {FOCUS_GROUPS.map((g) => (
        <div key={g}>
          <div className="stat-ranges-group">{title(g)}</div>
          {STAT_GROUPS[g].map((s: StatId) => (
            <div key={s} className="stat-range">
              <span>{title(s)}</span>
              <span className="num">
                +{stats[s]?.bonus}
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

// The arrows on the previous and next step buttons, in the button's color
const ARROWS = {
  left:
    "M73.4 297.4C60.9 309.9 60.9 330.2 73.4 342.7L233.4 502.7C245.9 515.2 266.2 515.2 278.7 502.7C291.2 490.2 291.2 469.9 278.7 457.4L173.3 352L544 352C561.7 352 576 337.7 576 320C576 302.3 561.7 288 544 288L173.3 288L278.7 182.6C291.2 170.1 291.2 149.8 278.7 137.3C266.2 124.8 245.9 124.8 233.4 137.3L73.4 297.3z",
  right:
    "M566.6 342.6C579.1 330.1 579.1 309.8 566.6 297.3L406.6 137.3C394.1 124.8 373.8 124.8 361.3 137.3C348.8 149.8 348.8 170.1 361.3 182.6L466.7 288L96 288C78.3 288 64 302.3 64 320C64 337.7 78.3 352 96 352L466.7 352L361.3 457.4C348.8 469.9 348.8 490.2 361.3 502.7C373.8 515.2 394.1 515.2 406.6 502.7L566.6 342.7z",
};

export function Arrow({ to }: { to: keyof typeof ARROWS }) {
  return (
    <svg className="arrow-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true">
      <path d={ARROWS[to]} />
    </svg>
  );
}

// Plus and minus, for the steppers and the Background slots' fold toggle, in
// the text's color
const SIGNS = {
  plus: "M432 256c0 17.69-14.33 32.01-32 32.01H256v144c0 17.69-14.33 31.99-32 31.99s-32-14.3-32-31.99v-144H48c-17.67 0-32-14.32-32-32.01s14.33-31.99 32-31.99H192v-144c0-17.69 14.33-32.01 32-32.01s32 14.32 32 32.01v144h144C417.7 224 432 238.3 432 256z",
  minus: "M400 288h-352c-17.69 0-32-14.32-32-32.01s14.31-31.99 32-31.99h352c17.69 0 32 14.3 32 31.99S417.7 288 400 288z",
};

export function Sign({ is }: { is: keyof typeof SIGNS }) {
  return (
    <svg className="sign-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true">
      <path d={SIGNS[is]} />
    </svg>
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
          <Sign is="minus" />
        </button>
        <span className="num" aria-live="polite">
          {level}
        </span>
        <button type="button" onClick={() => onChange(Math.min(MAX_LEVEL, level + 1))} disabled={disabled || level >= MAX_LEVEL} aria-label="Raise level">
          <Sign is="plus" />
        </button>
      </div>
    </div>
  );
}
