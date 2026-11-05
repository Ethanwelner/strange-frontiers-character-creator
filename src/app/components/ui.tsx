import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MAX_LEVEL } from "../../ai/level.js";
import { STAT_GROUPS, type StatBlock, type StatId } from "../../schema/index.js";
import { kindById, packageById, traitById } from "../content.js";
import { GENDERS, MAX_AGE, MAX_SIZE_LENGTH, type Draft, type Looks } from "../draft.js";
import { toPortrait } from "../portrait.js";

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
export function StepHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="step-head">
      <h2>{title}</h2>
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

// A notice with a dismiss button. One that `fades` goes away on its own after
// 3 seconds, and is a success (is-success) unless it's `bad`; other errors
// stay until the player dismisses them. A new message starts the wait over,
// so the message is one string.
export function Notice({ children, fades, bad, onDismiss }: { children: string; fades?: boolean; bad?: boolean; onDismiss: () => void }) {
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
    <div className={`notice${bad ? " bad" : fades ? " is-success" : ""}${leaving ? " is-leaving" : ""}`} role="status">
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

// The Action a Trait grants, like Fireball's "Cast Fireball: This character
// may spend 2 MP...", its name in bold
export function TraitAction({ action }: { action?: string }) {
  if (!action) return null;
  const colon = action.indexOf(": ");
  return (
    <p className="effect trait-action">
      {colon > 0 ? (
        <>
          <strong>{action.slice(0, colon)}:</strong> {action.slice(colon + 2)}
        </>
      ) : (
        action
      )}
    </p>
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

// The character's picture in a square frame. With onChange, an empty frame
// picks an image when clicked (shrunk in the browser, see portrait.ts); a
// filled one darkens and shows the pen on hover, and opens the picture in a
// popup with Replace image and Remove. Without onChange the frame only shows
// the picture, and nothing when there isn't one.
export function Portrait({
  portrait,
  name,
  onChange,
  className = "",
}: {
  portrait?: string;
  name?: string;
  onChange?: (portrait?: string) => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const alt = name ? `Portrait of ${name}` : "Character portrait";
  if (!onChange) {
    return portrait ? (
      <div className={`portrait ${className}`}>
        <img src={portrait} alt={alt} />
      </div>
    ) : null;
  }
  const close = () => {
    setOpen(false);
    setError(undefined);
  };
  // A picked image replaces the portrait and closes the popup; cancelling the picker leaves it open.
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      onChange(await toPortrait(file));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const choose = () => input.current?.click();
  return (
    <div className={`portrait-field ${className}`}>
      <button
        type="button"
        className={`portrait${portrait ? " portrait-filled" : " portrait-empty"}`}
        onClick={() => (portrait ? setOpen(true) : choose())}
        disabled={busy}
        aria-label={portrait ? "Edit the portrait" : "Add a portrait"}
      >
        {portrait ? (
          <>
            <img src={portrait} alt="" />
            <span className="portrait-edit" aria-hidden="true">
              <span className="pen-icon" />
            </span>
          </>
        ) : (
          <span className="portrait-prompt">
            <Icon name="upload" />
            {busy ? "Shrinking…" : "Add a portrait"}
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && !open && <p className="portrait-error">{error}</p>}
      {open && portrait && (
        <LorePopup label="Portrait" onClose={close} className="portrait-popup">
          <h3 className="lore-modal-title">Portrait</h3>
          <img className="portrait-large" src={portrait} alt={alt} />
          {error && <p className="portrait-error">{error}</p>}
          <div className="portrait-actions">
            <button type="button" className="primary" onClick={choose} disabled={busy}>
              <Icon name="upload" />
              {busy ? "Shrinking…" : "Replace image"}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                close();
              }}
              disabled={busy}
            >
              Remove
            </button>
          </div>
        </LorePopup>
      )}
    </div>
  );
}

// The character's description, the head's third column on the creator's
// sheet and in Player Tools, lined up over the Conditions and Items. Editable
// at any time with onChange; an AI build fills it with its summary.
export function DescriptionBox({ description, onChange }: { description?: string; onChange?: (description?: string) => void }) {
  if (!onChange) {
    return description ? (
      <div className="sheet-description">
        <p>{description}</p>
      </div>
    ) : null;
  }
  return (
    <div className="sheet-description">
      <textarea
        aria-label="Description"
        value={description ?? ""}
        maxLength={4000}
        placeholder="Who they are, how they look, what they want."
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}

export type { Looks };

// Age, gender, height and weight, cosmetic details the rules never read.
// Gender is a dropdown, Unlisted by default; Custom opens a field for the
// player's own word. Height and weight are free text in any units. The
// Character step and the describe box both use it, each with its own field styles.
export function LooksFields({
  looks,
  onChange,
  disabled,
  fieldClass,
  inputClass,
}: {
  looks: Looks;
  onChange: (looks: Looks) => void;
  disabled?: boolean;
  fieldClass: string;
  inputClass?: string;
}) {
  const setAge = (raw: string) => {
    const n = Number(raw);
    onChange({ ...looks, age: raw === "" || !Number.isFinite(n) ? undefined : Math.min(MAX_AGE, Math.max(0, Math.floor(n))) });
  };
  const setGender = (g: string) => {
    const gender = g === "unlisted" ? undefined : (g as Looks["gender"]);
    onChange({ ...looks, gender, customGender: gender === "custom" ? looks.customGender : undefined });
  };
  return (
    <>
      <label className={`${fieldClass} age-field`}>
        <span className="field-label">Age</span>
        <input
          className={inputClass}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_AGE}
          step={1}
          value={looks.age ?? ""}
          placeholder="—"
          onChange={(e) => setAge(e.target.value)}
          disabled={disabled}
        />
      </label>
      <label className={`${fieldClass} gender-field`}>
        <span className="field-label">Gender</span>
        <select className={inputClass} value={looks.gender ?? "unlisted"} onChange={(e) => setGender(e.target.value)} disabled={disabled}>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {title(g)}
            </option>
          ))}
        </select>
      </label>
      {looks.gender === "custom" && (
        <label className={`${fieldClass} custom-gender-field`}>
          <span className="field-label">Custom Gender</span>
          <input
            className={inputClass}
            value={looks.customGender ?? ""}
            maxLength={40}
            placeholder="In your own words"
            onChange={(e) => onChange({ ...looks, customGender: e.target.value || undefined })}
            disabled={disabled}
          />
        </label>
      )}
      <label className={`${fieldClass} height-field`}>
        <span className="field-label">Height</span>
        <input
          className={inputClass}
          value={looks.height ?? ""}
          maxLength={MAX_SIZE_LENGTH}
          placeholder="—"
          onChange={(e) => onChange({ ...looks, height: e.target.value || undefined })}
          disabled={disabled}
        />
      </label>
      <label className={`${fieldClass} weight-field`}>
        <span className="field-label">Weight</span>
        <input
          className={inputClass}
          value={looks.weight ?? ""}
          maxLength={MAX_SIZE_LENGTH}
          placeholder="—"
          onChange={(e) => onChange({ ...looks, weight: e.target.value || undefined })}
          disabled={disabled}
        />
      </label>
    </>
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
  // arrow-rotate-right
  restore: { viewBox: "0 0 512 512", d: "M496 48V192c0 17.69-14.31 32-32 32H320c-17.69 0-32-14.31-32-32s14.31-32 32-32h63.39c-29.97-39.7-77.25-63.78-127.6-63.78C167.7 96.22 96 167.9 96 256s71.69 159.8 159.8 159.8c34.88 0 68.03-11.03 95.88-31.94c14.22-10.53 34.22-7.75 44.81 6.375c10.59 14.16 7.75 34.22-6.375 44.81c-39.03 29.28-85.36 44.86-134.2 44.86C132.5 479.9 32 379.4 32 256s100.5-223.9 223.9-223.9c69.15 0 134 32.47 176.1 86.12V48c0-17.69 14.31-32 32-32S496 30.31 496 48z" },
  // paper-plane-top
  send: { viewBox: "0 0 512 512", d: "M511.1 255.1c0 12.8-7.625 24.38-19.41 29.41L44.6 477.4c-4.062 1.75-8.344 2.594-12.59 2.594c-8.625 0-17.09-3.5-23.28-10.05c-9.219-9.766-11.34-24.25-5.344-36.27l73.66-147.3l242.1-30.37L77.03 225.6l-73.66-147.3C-2.623 66.3-.4982 51.81 8.72 42.05c9.25-9.766 23.56-12.75 35.87-7.453L492.6 226.6C504.4 231.6 511.1 243.2 511.1 255.1z" },
  // The damage types, from game-icons.net as on the Mechanics page
  blunt: { viewBox: "0 0 512 512", d: "M215.97 27.813c-2.218.04-4.35.177-6.407.375l-.532.062c-2.774.266-5.796 1.01-9.124 1.844-4.418 1.11-8.096 2.607-11.125 4.406l77.782 59.313 7.375 5.656-5.593 7.405-13.72 18.156 67.595 51.626 14.217-18.812 9.47-12.53 6.5 14.342 19.656 43.47 60.593-80.095-47.187-7.124-15.533-2.312 9.47-12.563 14.28-18.843-67.593-51.624L310.78 50.78l-5.03 6.657-7.188-4.25c-28.635-16.917-58.02-25.157-80.343-25.374a76.706 76.706 0 0 0-2.25 0zM453 127.124l-71.47 94.438 34.564 26.187c44.24-20.22 64.01-52.594 71.312-94.625l-34.406-26zm-193.688 25.03c-27.17 33.09-55.308 64.706-82.812 96.22l47.406 39.875c23.11-35.343 46.336-71.61 71.938-108.22l-36.53-27.874zM164.25 262.47c-11.355 13.115-22.564 26.254-33.5 39.5l48.375 52.717c11.707-16.6 23.107-33.515 34.438-50.687l-49.313-41.53zm-45.438 54.124a1111.646 1111.646 0 0 0-23.093 29.72l33.468 73.842c13.586-16.22 26.434-32.893 38.843-49.937l-49.218-53.626zm-35.75 47.03c-12.108 16.978-23.57 34.335-34.124 52.282L98.53 454.47a688.442 688.442 0 0 0 17.22-18.72l-32.688-72.125zm-43.437 68.688a546.43 546.43 0 0 0-14.75 29l37.375 28.313a611.184 611.184 0 0 0 23.125-21.72l-45.75-35.592z" },
  slashing: { viewBox: "0 0 512 512", d: "M275.03 20c35.223 49.563 53.59 113.64 55.69 173.47C315.154 143 289.092 88.423 250.81 48.75c40.294 79.527 51.15 172.312 37.938 256.094-12.287-75.777-40.564-159.524-92.375-227.156 29.6 70.937 36.64 149.785 24.813 221.843-8.745-51.804-25.41-107.4-52.594-158.81 13.023 54.315 12.854 107.64 3.437 159.28l21.657 6.813 15 4.718-11.28 10.908c-10.68 10.332-19.868 21.905-27.345 34.343 93.614 35.486 232.952 64.53 298.032 41.376-41.02 56.466-210.332 13.822-309.313-18.687-1.514 3.775-2.918 7.594-4.124 11.467a152.536 152.536 0 0 0-6.062 29.657l176.47 66.375c98.5 31.095 150.5-24.62 158.655-81.72C505.253 254.472 485.016 105.66 426.06 20h-22.187c40.092 65.52 66.67 154.216 60.47 255.344-8.154-79.833-42.8-157.214-98.44-219.5 38.676 85.094 56.566 185.746 34.376 288.625.057-118.816-33.1-225.865-105.092-324.47H275.03zm-110.186 1.594c41.255 29.176 74.328 74.093 97.5 120.656-7.702-46.15-21.3-86.79-44-120.656h-53.5zm176.375 0c28.882 15.143 52.096 36.614 71.28 66.78-7.14-27.79-17.217-49.85-31.438-66.78H341.22zM123.686 304.406a179.344 179.344 0 0 1-4.062 64L18.812 336.344V366l91.938 29.094a178.602 178.602 0 0 1-30.313 48.28l50.094 15.75c-3.038-24.898-1.136-49.885 6.282-73.718 7.446-23.92 20.223-46.108 37.032-65.22l-50.156-15.78z" },
  piercing: { viewBox: "0 0 512 512", d: "M242.5 21.5c-25.192 3.245-47.28 32.016-47.28 68.78 0 20.28 7.038 38.25 17.5 50.75l10.25 12.25-15.69 2.94c-6.058 1.128-11.42 3.163-16.25 6.093l50.907 29.343.22.125c10.092 5.547 17.387 12.847 21.687 20.72 4.332 7.932 5.865 16.78 2.562 24.75-3.302 7.97-12.133 13.29-21.687 13.344-9.457.054-20.02-3.703-32.345-11.5-.13-.082-.245-.136-.375-.22l-52.313-30.06a192.847 192.847 0 0 0-4.156 14.56c-8.238 33.626-9.925 74.615-10.155 110.407H189.5l.625 8.626 11.28 149.78 96.69.002 9.935-149.69.564-8.72h42c-.013-36.18-.378-77.737-7.844-111.624-4.05-18.384-10.197-34.295-18.813-45.75-8.615-11.454-19.257-18.706-34.593-21.062l-16-2.438L283.5 140.25c10.008-12.437 16.72-30.183 16.72-49.97-.002-39.2-24.78-68.718-52.5-68.718-2.913 0-4.762-.12-5.22-.062zM20.812 85.78v21.626l200.875 115.5.188.094.188.125c10.573 6.74 18.416 8.805 22.53 8.78 4.115-.022 4.113-.724 4.563-1.81.45-1.09.63-4.324-1.72-8.626-2.348-4.304-7.01-9.363-14.436-13.407l-.094-.032-.094-.06-212-122.19zm396.97 187.626-15.626 28.22-33.656-19.063c.355 8.144.576 16.234.688 24.187l22.906 13.03-15.47 27.94 114.97 15.124-73.813-89.438z" },
  heat: { viewBox: "0 0 512 512", d: "M162.22 21.312c-183.876 106.68 51.994 227.35-10.19 332.47C116.95 413.083 38.11 325.45 43.75 227-6.035 353.376 30.21 443.745 95.22 492.75c1.386.34 17.577.498 41.186.562-28.478-16.9-32.06-75.355 32.813-103.25l15.78-7L182.062 400c-1.356 8.34-.318 13.95 1.188 16.937 1.507 2.987 3.106 3.544 5.844 4.094 5.475 1.1 16.963-2.395 26.28-14.624 18.636-24.457 29.117-80.228-26.874-167l-4.094-6.437-13.906-19.25 23.25 9.905 5.25 1.75c80.85 25.498 135.3 58.46 174.625 112.72 21.544-22.906 38.7-56.835 43.812-91.69l3.5-27.468 13.438 23.97c25.525 45.802 30.267 104.912 11.094 156.5-14.23 38.28-42.036 72.34-84 93.5 13.623-.01 24.05.032 25.25.124 154.76-34.77 139.345-244.952-14.19-394.093.012.726 0 1.46 0 2.188 78.964 185.87-136.465 189.104-119.25 11.47-41.686 100.463-132.86-2.147-91.06-91.283zM269.093 332.25c13.51 15.806 22.35 33.086 22.78 50.812.587 24.03-9.293 47.12-24.53 66.563-14.832 18.926-34.837 34.62-56.625 43.656 33.127-.065 64.926-.16 95.217-.25l-.062-.186c30.95-18.584 47.31-38.83 53.75-57.813 6.44-18.982 3.25-37.246-5.844-53.718-15.44-27.97-49.705-47.71-84.686-49.062z" },
  cold: { viewBox: "0 0 512 512", d: "M238.406 26.844c-9.653.12-18.926 2.69-30.437 7.062l-157.282 57c-20.984 7.65-21.587 11.834-22.344 33.28L20.937 358.22c-1.207 27.514-.654 33.187 23.25 43.56l185.783 81.41c19.34 8.29 31.906 7.655 45.186 3.218l181.938-56.53c21.95-7.295 25.04-9.627 25.875-36.845l7.686-250.155c.662-17.37-5.667-24.695-18.78-29.625L271.062 34.375c-12.977-5.344-23.003-7.653-32.657-7.53zm.813 24.875c23.637-.053 45.564 8.434 87.874 24.874 95.545 37.123 131.71 53.8 69.687 77.937-74.002 28.802-128.175 45.115-172.28 25.814L113.47 131.75c-34.57-15.127-44.69-27.46 17.843-50.094 55.64-20.14 82.742-29.882 107.906-29.937zm44.718 43.75c-38.284.402-55.285 21.205-56.813 38.936-.873 10.132 2.95 19.6 12.406 26.25 9.456 6.65 25.355 10.56 48.97 5.938 35.817-7.01 61.536-15.056 77.5-22.844 7.982-3.894 13.464-7.737 16.5-10.844 3.036-3.107 3.453-4.942 3.438-6-.016-1.057-.44-2.675-3.313-5.406-2.873-2.73-8.03-6.04-15.22-9.156-14.378-6.233-36.757-11.877-65.717-15.72-6.355-.842-12.28-1.213-17.75-1.155zM59.25 134c10.372-.29 29.217 7.2 63.906 22.656 140.925 62.786 140.52 65.876 130.97 200.656-7.783 109.81-8.797 109.85-128.47 59.282-73.15-30.91-86.806-40.853-85.187-88.97l5.468-162.937c.674-20.034 1.557-30.358 13.312-30.687zm381.938 30.906c29.172-.384 29.1 28.075 26.75 105.25-4.118 135.132-9.05 140.184-120.375 173.72-70.42 21.21-81.49 25.614-78.97-12.032l11-164.156c3.217-48.034 7.588-51.508 94.813-83.907 31.323-11.633 52.534-18.686 66.78-18.874zm-20.438 40.688c-.332-.002-.674.015-1 .03-5.22.263-10.226 2.77-14.188 8.407-3.96 5.638-6.81 14.71-5.687 27.907 1.448 17.033-4.507 38.11-15.156 56.938-10.65 18.827-26.502 35.91-47.814 38.813-29.127 3.968-42.41 23.58-43.5 42.062-.545 9.24 2.108 18.03 7.688 24.594s14.088 11.335 27.187 12.03c41.146 2.185 71.336-10.766 91.595-39.155 20.26-28.39 30.396-73.76 25.875-136.595-1.876-26.076-14.708-34.977-25-35.03zm-246.25 8.844c-.644 0-1.218.063-1.72.187-2.003.494-3.685 1.53-5.655 4.813-1.913 3.186-3.688 8.618-4.406 16.343l-.064.657c-1.388 16.732-8.098 28.602-17.844 35.063-9.745 6.46-20.794 7.808-31.125 9.094-10.33 1.286-20.177 2.39-28.156 5.75-7.977 3.36-14.36 8.38-19.468 19.78-7.2 16.076-7.143 28.027-3.124 38.563 4.018 10.537 12.688 20.106 24.687 28.75 23.998 17.29 60.27 29.956 88.906 41.844 11.386 4.727 20.496 6.484 27.282 6.126 6.787-.358 11.278-2.423 15.375-6.562 8.195-8.28 14.057-27.692 15-57.344 2.024-63.623-18.84-110.284-38.656-130.875-8.668-9.008-16.52-12.193-21.03-12.188zm184.22 6.812c-.95-.003-1.927.035-2.97.094-35.464 1.99-48.477 12.867-52.5 24.062-4.023 11.196.826 27.07 10.844 39.78 11.488 14.58 20.59 15.736 30.437 12.283 9.848-3.455 20.542-14.108 27.376-26.908s9.512-27.397 7.188-36.28c-1.163-4.443-3.144-7.422-6.47-9.626-2.908-1.928-7.274-3.388-13.905-3.406z" },
  electrical: { viewBox: "0 0 512 512", d: "M376 211H256V16L136 301h120v195z" },
  emp: { viewBox: "0 0 512 512", d: "M133.844 19.97c-28.18.03-55.19 11.19-77.875 33.624-26.88 26.58-37.526 56.483-36.095 85.875 1.43 29.39 15.237 58.516 39 82.28 9.592 9.593 44.044 33.04 74.78 52.563 1.14.723 2.104 1.293 3.22 2l44.344-44.344c-22.65-18.013-45.176-36.208-53.72-44.75h-.03c-24.88-24.882-22.98-56.233-5.626-73.032 17.354-16.8 48.748-18.29 73.25 5.937 8.61 8.51 26.702 30.837 44.656 53.313l38.438-38.407c-.71-1.12-1.305-2.073-2.032-3.218-19.468-30.66-42.827-64.955-52.47-74.656C195.738 33.16 165.59 20.706 136.564 20c-.91-.022-1.81-.032-2.718-.03zm190.312 77.25-34.72 20.624c.836 1.31 1.673 2.633 2.502 3.937 19.683 31 36.406 59.032 36.406 59.032l3.75 6.25-5.156 5.157-46.313 46.31-7.47 7.47-6.5-8.344s-12.84-16.436-28.5-36.187l-28.843 28.843a9056.369 9056.369 0 0 0 36.22 28.437l8.374 6.47-7.5 7.5-52.344 52.374-5.156 5.156-6.25-3.75s-24.577-14.675-53.125-32.688l-19.78 48.22 36.375-14.344 15.156 81.718 28.126-55.28 60.406 63.25-15.718-86.126 51.875 6.28 2.624 1.345 4.03 47.344 77.595 11.092-12.095 52.375L403.47 492h86.624v-81.594l-50.375-29.22 10.092-41.31-96.718-3.032 14.094-44.313-42.157-29.967 2.345-21.094 52.344 17.06-31.126-69.75 42.72-22.53-65.44-20.063-1.718-48.968zm-35.78 54.03-36.907 36.906c11.742 14.79 19.468 24.643 23.405 29.688l33.656-33.656a2417.118 2417.118 0 0 0-20.155-32.938zm-92.407 92.406-42.876 42.875a2446.831 2446.831 0 0 0 32.937 20.158l39.72-39.75c-5.06-3.934-14.962-11.59-29.78-23.282z" },
  metaphysical: { viewBox: "0 0 512 512", d: "M486 203.652H310.111L256 37.113l-54.111 166.539H26l142.22 103.623-54.462 167.612L256 371.24l142.242 103.646-54.473-167.612zm-85.995 28.008-65.335 47.596-15.46-47.596h80.795zM256 127.708l24.658 75.91H231.33zM111.995 231.66h80.795l-15.45 47.596zm55.097 169.713 24.932-76.743 40.194 29.29zm34.041-104.762 21.1-64.951h67.524l21.099 64.95-54.867 39.977zm143.731 104.762-65.082-47.454 40.194-29.29zm-37.983-264.359-10.424-32.092a183.269 183.269 0 0 1 114.322 81.21H376.43a155.293 155.293 0 0 0-69.55-49.118zM129 371.328l-10.413 32.049a182.425 182.425 0 0 1-43.918-142.581l26.684 19.435v2.847A153.804 153.804 0 0 0 129 371.284zm177.104 58.108 26.64 19.413a182.447 182.447 0 0 1-153.51 0l26.64-19.413a154.79 154.79 0 0 0 100.23 0zM135.569 186.133h-34.348a183.269 183.269 0 0 1 114.322-81.21l-10.424 32.091a155.293 155.293 0 0 0-69.55 49.119zm303.12 96.955a181.922 181.922 0 0 1-45.276 120.245L383 371.285a153.804 153.804 0 0 0 27.68-88.197v-2.846l26.683-19.446a183.685 183.685 0 0 1 1.325 22.292z" },
  death: { viewBox: "0 0 512 512", d: "M296.625 25.406c-63.794.388-135.81 14.683-206.03 32.844-3.472 34.08 2.226 68.906 14.03 104.25C181.175 75.936 393.65 44.825 486.72 128 456.02 50.466 384.046 24.874 296.624 25.406zM65.655 61.438 27.906 71c5.643 78.022 28.546 132.393 60.44 174.47-16.54 10.348-40.693 19.673-68.782 26.843 5.664 6.597 14.25 16.18 30.53 18.53 24.846-4.33 39.912-14.982 53.75-26.593 76.24 85.145 190.22 118.955 253.126 224.22l49.436-.126C290.996 275.316 81.01 364.804 65.656 61.438z" },
  psychic: { viewBox: "0 0 512 512", d: "M65.125 18.344C47.11 49.844 36.72 86.262 36.72 125.124c0 80.293 43.973 150.497 109.124 187.75.403-6.904.92-13.833 1.625-20.75-55.33-34.965-92.064-96.676-92.064-167 0-39.426 11.63-75.964 31.563-106.78H65.124zm69.03 0c-25.61 28.273-41.374 65.635-41.374 106.78 0 51.08 24.052 96.656 61.44 125.97l.06-.25c1.612-6.61 3.473-13.008 5.69-19.125-29.73-25.896-48.5-64.026-48.5-106.595 0-42.848 19.254-80.837 49.436-106.78h-26.75zm210.532 0c30.125 25.95 49.438 64.003 49.438 106.78 0 41.152-17.546 78.157-45.563 103.97 2.26 6.282 4.116 12.876 5.657 19.687 35.748-29.366 58.592-73.883 58.592-123.655 0-41.123-15.81-78.5-41.406-106.78h-26.72zm73.407 0c20.06 30.867 32.094 67.387 32.094 106.78 0 69.457-35.82 130.505-90 165.69.545 7.037.933 14.107 1.187 21.123 64.267-37.483 107.53-107.18 107.53-186.812 0-38.925-10.745-75.328-28.874-106.78h-21.936zm-165.313 2.28c-57.625 0-104.53 46.906-104.53 104.532 0 28.606 11.56 54.573 30.25 73.47 4.13-4.712 8.84-8.817 14.094-12.19-15.844-15.56-25.656-37.237-25.656-61.28 0-47.527 38.316-85.844 85.843-85.844 47.528 0 85.845 38.317 85.845 85.844 0 23.16-9.108 44.114-23.938 59.53 5.488 3.14 10.394 7.033 14.688 11.533 17.327-18.666 27.938-43.657 27.938-71.064 0-57.626-46.905-104.53-104.532-104.53zm-4.186 55.564c-21.622 2.8-40.97 27.91-40.97 60.28 0 17.846 6.173 33.653 15.282 44.595l10.188 12.218-15.656 2.94c-11.884 2.226-20.62 8.512-28.032 18.655-7.41 10.143-13.023 24.216-16.97 40.406-7.188 29.5-8.736 65.498-8.967 97.126h38.999l.655 8.656 9.906 132.5h83.69l8.75-132.437.592-8.72h37.125c-.02-32-.39-68.49-6.906-98.217-3.57-16.297-8.992-30.34-16.5-40.375-7.505-10.035-16.654-16.288-29.967-18.344L273.875 193l10.094-12.625c8.713-10.89 14.592-26.495 14.592-43.906 0-34.515-21.658-60.22-45.468-60.22-2.672 0-4.275-.092-4.5-.063z" },
  radiation: { viewBox: "0 0 512 512", d: "M253.78 17.188c-130.728 0-236.905 106.177-236.905 236.906C16.875 384.824 123.052 491 253.78 491c130.73 0 236.907-106.18 236.907-236.906 0-130.73-106.177-236.906-236.906-236.906zm0 18.687c120.63 0 218.22 97.59 218.22 218.22 0 120.626-97.59 218.218-218.22 218.218-120.628 0-218.218-97.59-218.218-218.22s97.59-218.218 218.22-218.218zm101.19 46.313-76.41 132.875c15.916 9.635 25.177 26.33 26.125 43.78h148.407c1.644-70.01-33.49-138.867-98.125-176.656zm-205.126 2.468c-27.1 16.725-50.68 40.147-67.72 69.656-19.01 32.928-26.926 69.12-26 104.532H196a54.04 54.04 0 0 1 7.188-24.438c5.21-9.024 12.64-16 21.218-20.625L149.844 84.657zm100.594 141.156a36.723 36.723 0 0 0-2.594.094c-11.446.793-22.288 7.084-28.5 17.844-9.94 17.216-4.09 38.967 13.125 48.906 17.213 9.94 38.935 4.12 48.874-13.094 9.94-17.215 4.12-38.967-13.094-48.906-5.648-3.26-11.768-4.824-17.813-4.844zm28.218 82.375c-16.127 9.75-36.864 10.846-54.406 1.25l-68.03 117.22c29.454 16.785 61.044 25.177 92.75 26 34.567.898 68.72-7.786 99.124-24.032l-69.438-120.438z" },
  acidic: { viewBox: "0 0 512 512", d: "M433.814 68.664c-2.74.05-5.495.423-8.242 1.152-8.47 2.25-15.3 7.512-20.44 14.49C292.905 120.865 186.494 154.58 75.276 190.4c-39.714 12.79-64.6 51.163-53.006 86.784 11.597 35.62 54.342 52.277 94.035 39.277l-.002.002c109.41-35.827 214.424-69.036 325.12-104.656.56.212 1.13.39 1.694.58-2.62 2.935-4.226 6.796-4.226 11.04 0 9.164 7.43 16.593 16.594 16.593 9.165 0 16.596-7.43 16.596-16.593 0-4.32-1.664-8.24-4.367-11.192 12.75-4.865 21.353-16.866 25.535-30.898 4.547-15.257 4.504-33.654-.584-52.48-5.088-18.828-14.327-34.77-25.94-45.712-8.712-8.206-19.263-13.79-30.175-14.43-.91-.052-1.822-.07-2.736-.054zm.497 18.68a17.2 17.2 0 0 1 1.377.035c5.567.358 11.818 3.34 18.22 9.37 8.535 8.04 16.44 21.165 20.716 36.986 3.622 13.4 4 26.397 2.012 36.852h-52.783c-3.517-6.207-6.512-13.352-8.622-21.158-4.276-15.822-4.046-31.094-.716-42.266 3.33-11.172 9.122-17.497 15.855-19.285a16.148 16.148 0 0 1 3.94-.536zm-38.414 17.043c-3.815 14.734-3.516 32.133 1.29 49.92a114.327 114.327 0 0 0 5.728 16.26h-151.22c-64.405 20.742-125.856 40.507-163.35 52.59-23.24 7.486-35.353 27.407-30.406 42.593 4.946 15.188 26.582 24.333 49.75 16.75 66.89-21.89 199.01-64.39 302.822-97.803 3.76 5.807 7.998 10.967 12.62 15.323.066.06.135.118.2.18-104.876 33.753-241.66 77.74-309.83 100.05-30.827 10.09-64.424-1.334-73.344-28.72-8.92-27.385 11.603-56.22 42.438-66.155 68.055-21.93 208.2-66.996 313.302-100.988zm59.58 180.205c-16.948 63.255-40.507 54.472-40.507 91.5 0 22.36 18.146 40.508 40.507 40.508 22.36 0 40.507-18.147 40.507-40.508 0-39.97-23.256-27.12-40.507-91.5z" },
  // Movement, Font Awesome Pro's solid person-running
  "person-running": { viewBox: "0 0 448 512", d: "M400 224h-44l-26.12-53.25c-12.5-25.5-35.38-44.25-61.75-51L197 98.63C189.5 96.84 181.1 95.97 174.5 95.97c-20.88 0-41.33 6.81-58.26 19.78L76.5 146.3C68.31 152.5 64.01 162 64.01 171.6c0 17.11 13.67 32.02 32.02 32.02c6.808 0 13.67-2.158 19.47-6.616l39.63-30.38c5.92-4.488 13.01-6.787 19.53-6.787c2.017 0 3.981 .2196 5.841 .6623l14.62 4.25l-37.5 87.5C154.1 260.3 152.5 268.8 152.5 277.2c0 22.09 11.49 43.52 31.51 55.29l85 50.13l-27.5 87.75c-.9875 3.174-1.458 6.388-1.458 9.55c0 13.65 8.757 26.31 22.46 30.58C265.6 511.5 268.9 512 272 512c13.62 0 26.25-8.75 30.5-22.5l31.75-101c1.211-4.278 1.796-8.625 1.796-12.93c0-16.57-8.661-32.51-23.55-41.44l-61.13-36.12l31.25-78.38l20.25 41.5C310.9 277.4 327.9 288 345.1 288H400c17.62 0 32-14.38 32-32C432 238.3 417.6 224 400 224zM288 96c26.5 0 48-21.5 48-48s-21.5-48-48-48s-48 21.5-48 48S261.5 96 288 96zM129.8 317.5L114.9 352H48c-17.62 0-32 14.38-32 32s14.38 32 32 32h77.5c19.25 0 36.5-11.5 44-29.12l8.875-20.5l-10.75-6.25C150.4 349.9 137.6 334.8 129.8 317.5z" },
  // Resistances' badge, Font Awesome Pro's solid shield
  shield: { viewBox: "0 0 512 512", d: "M466.5 83.71l-192-80C269.6 1.67 261.3 0 256 0C250.7 0 242.5 1.67 237.6 3.702l-192 80C27.7 91.1 16 108.6 16 127.1c0 257.2 189.2 384 239.1 384c51.1 0 240-128.2 240-384C496 108.6 484.3 91.1 466.5 83.71zM256 446.5l.0234-381.1c.0059-.0234 0 0 0 0l175.9 73.17C427.8 319.7 319 417.1 256 446.5z" },
  // Damage badges: crosshairs for ranged and thrown weapons, a sword for the rest
  crosshairs: { viewBox: "0 0 512 512", d: "M224 256C224 238.3 238.3 224 256 224C273.7 224 288 238.3 288 256C288 273.7 273.7 288 256 288C238.3 288 224 273.7 224 256zM256 0C273.7 0 288 14.33 288 32V42.35C381.7 56.27 455.7 130.3 469.6 224H480C497.7 224 512 238.3 512 256C512 273.7 497.7 288 480 288H469.6C455.7 381.7 381.7 455.7 288 469.6V480C288 497.7 273.7 512 256 512C238.3 512 224 497.7 224 480V469.6C130.3 455.7 56.27 381.7 42.35 288H32C14.33 288 0 273.7 0 256C0 238.3 14.33 224 32 224H42.35C56.27 130.3 130.3 56.27 224 42.35V32C224 14.33 238.3 0 256 0V0zM224 404.6V384C224 366.3 238.3 352 256 352C273.7 352 288 366.3 288 384V404.6C346.3 392.1 392.1 346.3 404.6 288H384C366.3 288 352 273.7 352 256C352 238.3 366.3 224 384 224H404.6C392.1 165.7 346.3 119.9 288 107.4V128C288 145.7 273.7 160 256 160C238.3 160 224 145.7 224 128V107.4C165.7 119.9 119.9 165.7 107.4 224H128C145.7 224 160 238.3 160 256C160 273.7 145.7 288 128 288H107.4C119.9 346.3 165.7 392.1 224 404.6z" },
  // A Max Range badge: a dashed arc to a target
  range: { viewBox: "2.52 -58.63 268.34 268.34", d: "M193.79 10.62L204.81 15.47A12.12095 12.12095 0 0 1 195.04 37.66L184.02 32.81A12.12095 12.12095 0 0 1 193.79 10.62ZM127.10 2.22L139.08 1.12A12.12155 12.12155 0 0 1 141.31 25.26L129.33 26.36A12.12155 12.12155 0 0 1 127.10 2.22ZM2.86 135.03L5.71 123.34A12.12155 12.12155 0 0 1 29.26 129.06L26.42 140.76A12.12155 12.12155 0 0 1 2.86 135.03ZM65.91 28.56L75.91 21.86A12.12155 12.12155 0 0 1 89.41 42.01L79.40 48.70A12.12155 12.12155 0 0 1 65.91 28.56ZM22.44 75.02L29.02 64.95A12.12155 12.12155 0 0 1 49.32 78.21L42.74 88.28A12.12155 12.12155 0 0 1 22.44 75.02ZM210.79 61.06A30.0361 30.0361 0 1 0 270.87 61.06A30.0361 30.0361 0 1 0 210.79 61.06Z" },
  sword: { viewBox: "0 0 512 512", d: "M110.1 227.6c-6.25-6.248-16.37-6.248-22.62 0l-18.75 18.75c-5.498 5.373-6.249 13.87-1.999 20.25l53.37 79.99l-53.5 53.5l-29.25-14.62c-5.375-2.748-11.75-1.623-16 2.625l-17.25 17.25c-5.5 5.375-5.5 14.25 0 19.62l82.87 82.87c5.375 5.5 14.25 5.5 19.62 0l17.25-17.25c4.25-4.25 5.375-10.62 2.625-16l-14.62-29.25l53.5-53.5l79.99 53.41c6.375 4.25 14.87 3.5 20.25-2l18.75-18.79c6.25-6.25 6.25-16.37 0-22.62L110.1 227.6zM493.7 .1497l-93.74 15.88L171.9 244.1l95.99 95.99l228.1-228.1l15.87-93.75C513.3 7.781 504.2-1.35 493.7 .1497z" },
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
        <button type="button" onClick={() => onChange(Math.max(1, level - 1))} disabled={disabled || level <= 1} aria-label="Lower Level">
          <Sign is="minus" />
        </button>
        <span className="num" aria-live="polite">
          {level}
        </span>
        <button type="button" onClick={() => onChange(Math.min(MAX_LEVEL, level + 1))} disabled={disabled || level >= MAX_LEVEL} aria-label="Raise Level">
          <Sign is="plus" />
        </button>
      </div>
    </div>
  );
}
