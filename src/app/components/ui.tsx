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
const NOTICE_MS = 3000;
const NOTICE_FADE_MS = 400;

// A notice with a dismiss button. One that `fades` is a success (is-success)
// and goes away on its own after 3 seconds; errors stay until the player
// dismisses them. A new message starts the wait over, so the message is one
// string.
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
    <div className={`notice${fades ? " is-success" : ""}${leaving ? " is-leaving" : ""}`} role="status">
      {children}
      <button className="link" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

// Something's card in the site's lore popup (.lore-modal), like a Knowledge
// opened from the sheet. Escape, the backdrop and the close button shut it,
// and focus goes back to whatever opened it.
export function LorePopup({ label, onClose, children, className = "" }: { label: string; onClose: () => void; children: ReactNode; className?: string }) {
  const close = useRef<HTMLButtonElement>(null);
  const shut = useRef(onClose);
  shut.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    document.documentElement.classList.add("lore-modal-open");
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") shut.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("lore-modal-open");
      opener?.focus();
    };
  }, []);
  return (
    <div className={`lore-modal is-open ${className}`} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lore-modal-panel">
        <button ref={close} type="button" className="lore-modal-close" aria-label="Close" onClick={onClose}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2 2l16 16M18 2L2 18" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}

export function Chip(props: { children: ReactNode; tone?: "accent" | "muted" | "bad" }) {
  return <span className={`chip${props.tone ? ` chip-${props.tone}` : ""}`}>{props.children}</span>;
}

const STAT_SLOTS = 20;

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

// The site's stat bar: circles on odd points, squares on even. The Kind's
// bonus is gray, the player's points after it are black, room up to the max
// is open, and slots past the max are red.
export function StatLine({ bonus, value, max }: { bonus: number; value: number; max: number }) {
  const from = useAddedFrom(value);
  return (
    <div className="stat-line" aria-hidden="true">
      {Array.from({ length: STAT_SLOTS }, (_, n) => {
        const point = n + 1;
        const fill =
          point <= value ? (point > max ? "over" : point <= bonus ? "default" : "filled") : point <= max ? "empty" : "unavailable";
        const added = fill === "filled" && point > from ? " is-new" : "";
        return <span key={point} className={`stat ${point % 2 ? "dot" : "square"} ${fill}${added}`} />;
      })}
    </div>
  );
}

// A core stat with no focus stats, like Magic: a diamond per point, out of 20,
// with any bonus from a package (gray, or purple on the dark sheet) first. No
// Kind sets a Magic maximum, so every slot past the points is open.
export function CoreLine({ bonus = 0, value }: { bonus?: number; value: number }) {
  const from = useAddedFrom(value);
  return (
    <div className="stat-line" aria-hidden="true">
      {Array.from({ length: STAT_SLOTS }, (_, n) => (
        <span
          key={n}
          className={`stat diamond ${n < bonus ? "default" : n < value ? `filled${n >= from ? " is-new" : ""}` : "empty"}`}
        />
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

// Font Awesome icons, inline so CSS can size and color them (they take the
// text color). With a label, the icon stands in for that text; without one,
// it sits beside text that says the same thing.
const ICONS = {
  knowledge: { viewBox: "0 0 640 512", d: "M623.1 136.9l-282.7-101.2c-13.73-4.91-28.7-4.91-42.43 0L16.05 136.9C6.438 140.4 0 149.6 0 160s6.438 19.65 16.05 23.09L76.07 204.6c-11.89 15.8-20.26 34.16-24.55 53.95C40.05 263.4 32 274.8 32 288c0 9.953 4.814 18.49 11.94 24.36l-24.83 149C17.48 471.1 25 480 34.89 480H93.11c9.887 0 17.41-8.879 15.78-18.63l-24.83-149C91.19 306.5 96 297.1 96 288c0-10.29-5.174-19.03-12.72-24.89c4.252-17.76 12.88-33.82 24.94-47.03l190.6 68.23c13.73 4.91 28.7 4.91 42.43 0l282.7-101.2C633.6 179.6 640 170.4 640 160S633.6 140.4 623.1 136.9zM351.1 314.4C341.7 318.1 330.9 320 320 320c-10.92 0-21.69-1.867-32-5.555L142.8 262.5L128 405.3C128 446.6 213.1 480 320 480c105.1 0 192-33.4 192-74.67l-14.78-142.9L351.1 314.4z" },
  language: { viewBox: "0 0 640 512", d: "M416 256V63.1C416 28.75 387.3 0 352 0H64C28.75 0 0 28.75 0 63.1v192C0 291.2 28.75 320 64 320l32 .0106v54.25c0 7.998 9.125 12.62 15.5 7.875l82.75-62.12L352 319.9C387.3 320 416 291.2 416 256zM576 128H448v128c0 52.87-43.13 95.99-96 95.99l-96 .0013v31.98c0 35.25 28.75 63.1 63.1 63.1l125.8-.0073l82.75 62.12C534.9 514.8 544 510.2 544 502.2v-54.24h32c35.25 0 64-28.75 64-63.1V191.1C640 156.7 611.3 128 576 128z" },
  download: { viewBox: "0 0 512 512", d: "M480 352h-133.5l-45.25 45.25C289.2 409.3 273.1 416 256 416s-33.16-6.656-45.25-18.75L165.5 352H32c-17.67 0-32 14.33-32 32v96c0 17.67 14.33 32 32 32h448c17.67 0 32-14.33 32-32v-96C512 366.3 497.7 352 480 352zM432 456c-13.2 0-24-10.8-24-24c0-13.2 10.8-24 24-24s24 10.8 24 24C456 445.2 445.2 456 432 456zM233.4 374.6C239.6 380.9 247.8 384 256 384s16.38-3.125 22.62-9.375l128-128c12.49-12.5 12.49-32.75 0-45.25c-12.5-12.5-32.76-12.5-45.25 0L288 274.8V32c0-17.67-14.33-32-32-32C238.3 0 224 14.33 224 32v242.8L150.6 201.4c-12.49-12.5-32.75-12.5-45.25 0c-12.49 12.5-12.49 32.75 0 45.25L233.4 374.6z" },
  switch: { viewBox: "0 0 512 512", d: "M464 16c-17.67 0-32 14.31-32 32v74.09C392.1 66.52 327.4 32 256 32C161.5 32 78.59 92.34 49.58 182.2c-5.438 16.81 3.797 34.88 20.61 40.28c16.89 5.5 34.88-3.812 40.3-20.59C130.9 138.5 189.4 96 256 96c50.5 0 96.26 24.55 124.4 64H336c-17.67 0-32 14.31-32 32s14.33 32 32 32h128c17.67 0 32-14.31 32-32V48C496 30.31 481.7 16 464 16zM441.8 289.6c-16.92-5.438-34.88 3.812-40.3 20.59C381.1 373.5 322.6 416 256 416c-50.5 0-96.25-24.55-124.4-64H176c17.67 0 32-14.31 32-32s-14.33-32-32-32h-128c-17.67 0-32 14.31-32 32v144c0 17.69 14.33 32 32 32s32-14.31 32-32v-74.09C119.9 445.5 184.6 480 255.1 480c94.45 0 177.4-60.34 206.4-150.2C467.9 313 458.6 294.1 441.8 289.6z" },
  upload: { viewBox: "0 0 512 512", d: "M105.4 182.6c12.5 12.49 32.76 12.5 45.25 .001L224 109.3V352c0 17.67 14.33 32 32 32c17.67 0 32-14.33 32-32V109.3l73.38 73.38c12.49 12.49 32.75 12.49 45.25-.001c12.49-12.49 12.49-32.75 0-45.25l-128-128C272.4 3.125 264.2 0 256 0S239.6 3.125 233.4 9.375L105.4 137.4C92.88 149.9 92.88 170.1 105.4 182.6zM480 352h-160c0 35.35-28.65 64-64 64s-64-28.65-64-64H32c-17.67 0-32 14.33-32 32v96c0 17.67 14.33 32 32 32h448c17.67 0 32-14.33 32-32v-96C512 366.3 497.7 352 480 352zM432 456c-13.2 0-24-10.8-24-24c0-13.2 10.8-24 24-24s24 10.8 24 24C456 445.2 445.2 456 432 456z" },
  print: { viewBox: "0 0 512 512", d: "M448 192H64C28.65 192 0 220.7 0 256v96c0 17.67 14.33 32 32 32h32v96c0 17.67 14.33 32 32 32h320c17.67 0 32-14.33 32-32v-96h32c17.67 0 32-14.33 32-32V256C512 220.7 483.3 192 448 192zM384 448H128v-96h256V448zM432 296c-13.25 0-24-10.75-24-24c0-13.27 10.75-24 24-24s24 10.73 24 24C456 285.3 445.3 296 432 296zM128 64h229.5L384 90.51V160h64V77.25c0-8.484-3.375-16.62-9.375-22.62l-45.25-45.25C387.4 3.375 379.2 0 370.8 0H96C78.34 0 64 14.33 64 32v128h64V64z" },
  plus: { viewBox: "0 0 448 512", d: "M432 256c0 17.69-14.33 32.01-32 32.01H256v144c0 17.69-14.33 31.99-32 31.99s-32-14.3-32-31.99v-144H48c-17.67 0-32-14.32-32-32.01s14.33-31.99 32-31.99H192v-144c0-17.69 14.33-32.01 32-32.01s32 14.32 32 32.01v144h144C417.7 224 432 238.3 432 256z" },
};

export function Icon({ name, label, className = "" }: { name: keyof typeof ICONS; label?: string; className?: string }) {
  const { viewBox, d } = ICONS[name];
  return (
    <svg
      className={`icon icon-${name} ${className}`.trim()}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label && <title>{label}</title>}
      <path d={d} />
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
