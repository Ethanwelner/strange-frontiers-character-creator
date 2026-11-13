import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popup } from "./popup.js";
import { MAX_LEVEL } from "../../ai/level.js";
import { STAT_GROUPS, type StatBlock, type StatId } from "../../schema/index.js";
import { kindById, packageById, traitById } from "../content.js";
import { GENDERS, MAX_AGE, MAX_SIZE_LENGTH, type Draft, type Looks } from "../draft.js";
import { toPortrait } from "../portrait.js";
import { parseActionProfile } from "../actionProfile.js";
import type { DamageType } from "../../engine/damage.js";
import { Button } from "./Button.js";

export const GROUPS = Object.keys(STAT_GROUPS) as (keyof typeof STAT_GROUPS)[];
// The core stats with focus stats: every one but Magic.
export const FOCUS_GROUPS = GROUPS.filter((g) => STAT_GROUPS[g].length > 0);

export const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const traitName = (id: string) => traitById.get(id)?.name ?? id;

// A card's header bar color, the same for every card: anything from Isekai
// gets Dreft's green, and the rest (Earth and any plane) the Settled Systems gray.
export const regionClass = (plane: string | undefined) => `region-${plane === "isekai" ? "dreft" : "systems"}`;

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
      <Button kind="link" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </Button>
    </div>
  );
}

// The Action a Trait grants, like Fireball's "Cast Fireball: This character
// may spend 2 MP...", its name in bold
// A temporary weapon's profile, as an Action like Cast Fireball gives one,
// shows as the item cards' badges: the damage, led by crosshairs for a
// Ranged Attack or a sword for a Melee one, then its Max Range by an arc
// and its Area of Effect by a burst, then its Attack type and Stat. With the Trait's Rank, "per Rank"
// amounts are worked out; without it (the Traits step), they say per Rank.
// A Trait's effect. Lines starting with "- " are bullets, one for each part
// of the effect that does something different; other lines are paragraphs.
export function Effect({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  if (!lines.some((l) => l.startsWith("- "))) return <p className="sf-card-effect">{text}</p>;
  const blocks: (string | string[])[] = [];
  for (const l of lines) {
    if (!l.startsWith("- ")) blocks.push(l);
    else if (Array.isArray(blocks.at(-1))) (blocks.at(-1) as string[]).push(l.slice(2));
    else blocks.push([l.slice(2)]);
  }
  return (
    <div className="sf-card-effect">
      {blocks.map((b, i) =>
        Array.isArray(b) ? (
          <ul key={i}>
            {b.map((li, j) => (
              <li key={j}>{li}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b}</p>
        ),
      )}
    </div>
  );
}

export function TraitAction({ action, rank }: { action?: string; rank?: number }) {
  if (!action) return null;
  const colon = action.indexOf(": ");
  const name = colon > 0 ? action.slice(0, colon) : undefined;
  const text = colon > 0 ? action.slice(colon + 2) : action;
  const profile = parseActionProfile(text);
  if (!profile) {
    return (
      <p className="sf-card-action">
        {name && <strong>{name}:</strong>} {text}
      </p>
    );
  }
  const times = (n: number, perRank: boolean) => (perRank && rank ? n * rank : n);
  const perRankNote = !rank && (profile.damage.some((d) => d.perRank) || profile.areaOfEffect?.perRank);
  const ranged = /ranged|thrown/i.test(profile.attackType ?? "");
  return (
    <div className="sf-card-action">
      <p>
        {name && <strong>{name}:</strong>} {profile.before}
      </p>
      <div className="equipment-stats sf-item-badges sf-card-action-badges">
        {profile.damage.length > 0 && (
          <span className="chip equipment-stat" title={ranged ? "Ranged damage" : "Melee damage"}>
            <span className="item-stat-lead">
              <Icon name={ranged ? "crosshairs" : "sword"} label={ranged ? "Ranged damage" : "Melee damage"} />
            </span>
            {profile.damage.map((d) => (
              <span key={d.type} className="equipment-stat-value">
                <Icon name={d.type.toLowerCase() as Lowercase<DamageType>} label={d.type} />
                {times(d.amount, d.perRank)}
              </span>
            ))}
          </span>
        )}
        {profile.maxRange && (
          <span className="chip equipment-stat" title="Max Range">
            <span className="item-stat-lead">
              <Icon name="range" label="Max Range" />
            </span>
            <span className="equipment-stat-value">{profile.maxRange}</span>
          </span>
        )}
        {profile.areaOfEffect && (
          <span className="chip equipment-stat" title="Area of Effect">
            <span className="item-stat-lead">
              <Icon name="burst" label="Area of Effect" />
            </span>
            <span className="equipment-stat-value">
              {times(profile.areaOfEffect.amount, profile.areaOfEffect.perRank)} {profile.areaOfEffect.unit}
            </span>
          </span>
        )}
        {profile.attackType && <Chip>{profile.attackType} Attack</Chip>}
        {profile.attackStat && <Chip>{profile.attackStat}</Chip>}
        {profile.other.map((o) => (
          <Chip key={o}>{o}</Chip>
        ))}
        {perRankNote && <span className="muted small">Damage and area per Rank</span>}
      </div>
      {profile.after && <p>{profile.after}</p>}
    </div>
  );
}

export function Chip(props: { children: ReactNode; tone?: "accent" | "muted" | "bad" }) {
  return <span className={`chip${props.tone ? ` chip-${props.tone}` : ""}`}>{props.children}</span>;
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
      <Button
        kind="bare"
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
      </Button>
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
        <Popup label="Portrait" title="Portrait" onClose={close} size="narrow" className="portrait-popup">
          <img className="portrait-large" src={portrait} alt={alt} />
          {error && <p className="portrait-error">{error}</p>}
          <div className="portrait-actions">
            <Button tone="dark" onClick={choose} disabled={busy}>
              <Icon name="upload" />
              {busy ? "Shrinking…" : "Replace image"}
            </Button>
            <Button
              onClick={() => {
                onChange(undefined);
                close();
              }}
              disabled={busy}
            >
              Remove
            </Button>
          </div>
        </Popup>
      )}
    </div>
  );
}

// The character's description, the head's third column on the creator's
// sheet and in Player Tools, lined up over the Conditions and Items. Editable
// at any time with onChange; an AI build fills it with its summary.
export function DescriptionBox({ description, onChange }: { description?: string; onChange?: (description?: string) => void }) {
  if (!onChange) {
    return description ? <p>{description}</p> : null;
  }
  return (
    <textarea
      aria-label="Description"
      value={description ?? ""}
      maxLength={4000}
      placeholder="Who they are, how they look, what they want."
      onChange={(e) => onChange(e.target.value || undefined)}
    />
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
          <Button kind="bare" className={`name-text${name ? "" : " muted"}`} onClick={start}>
            {name || "Unnamed character"}
          </Button>
        )}
      </Heading>
      <Button
        kind="bare"
        className="name-edit"
        aria-label="Edit the name"
        // Keeps the field from losing focus first, so the pen doesn't reopen it
        onMouseDown={(e) => editing && e.preventDefault()}
        onClick={() => (editing ? finish(true) : start())}
      >
        <span className="pen-icon" aria-hidden="true" />
      </Button>
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
  corrosive: { viewBox: "0 0 512 512", d: "M433.814 68.664c-2.74.05-5.495.423-8.242 1.152-8.47 2.25-15.3 7.512-20.44 14.49C292.905 120.865 186.494 154.58 75.276 190.4c-39.714 12.79-64.6 51.163-53.006 86.784 11.597 35.62 54.342 52.277 94.035 39.277l-.002.002c109.41-35.827 214.424-69.036 325.12-104.656.56.212 1.13.39 1.694.58-2.62 2.935-4.226 6.796-4.226 11.04 0 9.164 7.43 16.593 16.594 16.593 9.165 0 16.596-7.43 16.596-16.593 0-4.32-1.664-8.24-4.367-11.192 12.75-4.865 21.353-16.866 25.535-30.898 4.547-15.257 4.504-33.654-.584-52.48-5.088-18.828-14.327-34.77-25.94-45.712-8.712-8.206-19.263-13.79-30.175-14.43-.91-.052-1.822-.07-2.736-.054zm.497 18.68a17.2 17.2 0 0 1 1.377.035c5.567.358 11.818 3.34 18.22 9.37 8.535 8.04 16.44 21.165 20.716 36.986 3.622 13.4 4 26.397 2.012 36.852h-52.783c-3.517-6.207-6.512-13.352-8.622-21.158-4.276-15.822-4.046-31.094-.716-42.266 3.33-11.172 9.122-17.497 15.855-19.285a16.148 16.148 0 0 1 3.94-.536zm-38.414 17.043c-3.815 14.734-3.516 32.133 1.29 49.92a114.327 114.327 0 0 0 5.728 16.26h-151.22c-64.405 20.742-125.856 40.507-163.35 52.59-23.24 7.486-35.353 27.407-30.406 42.593 4.946 15.188 26.582 24.333 49.75 16.75 66.89-21.89 199.01-64.39 302.822-97.803 3.76 5.807 7.998 10.967 12.62 15.323.066.06.135.118.2.18-104.876 33.753-241.66 77.74-309.83 100.05-30.827 10.09-64.424-1.334-73.344-28.72-8.92-27.385 11.603-56.22 42.438-66.155 68.055-21.93 208.2-66.996 313.302-100.988zm59.58 180.205c-16.948 63.255-40.507 54.472-40.507 91.5 0 22.36 18.146 40.508 40.507 40.508 22.36 0 40.507-18.147 40.507-40.508 0-39.97-23.256-27.12-40.507-91.5z" },
  // Condition cards and the sheet's Conditions title: a figure in a
  // viewfinder's corners, after Ethan's icon, simplified and thickened to
  // read at card size
  condition: { viewBox: "0 0 512 512", d: "M0 0H122.0A28.0 28.0 0 0 1 122.0 56H56V122.0A28.0 28.0 0 0 1 0 122.0ZM512 0V122.0A28.0 28.0 0 0 1 456 122.0V56H390.0A28.0 28.0 0 0 1 390.0 0ZM0 512V390.0A28.0 28.0 0 0 1 56 390.0V456H122.0A28.0 28.0 0 0 1 122.0 512ZM512 512H390.0A28.0 28.0 0 0 1 390.0 456H456V390.0A28.0 28.0 0 0 1 512 390.0ZM256 52A54 54 0 1 1 256 160A54 54 0 1 1 256 52ZM126 180H386A34 34 0 0 1 420 214V214A34 34 0 0 1 386 248H126A34 34 0 0 1 92 214V214A34 34 0 0 1 126 180ZM316 248V436A22 22 0 0 1 272 436V348A16 16 0 0 0 240 348V436A22 22 0 0 1 196 436V248Z" },
  // Ability cards and the sheet's Abilities title: a weightlifter, after
  // Ethan's icon, simplified and thickened to read at card size (a
  // stand-in until a better one)
  ability: { viewBox: "0 0 512 512", d: "M256 6A56 56 0 1 1 256 118A56 56 0 1 1 256 6ZM150 222V198A56 56 0 0 1 206 142H306A56 56 0 0 1 362 198V222ZM38 256H474A22 22 0 0 1 496 278V278A22 22 0 0 1 474 300H38A22 22 0 0 1 16 278V278A22 22 0 0 1 38 256ZM196 334H316V478A22 22 0 0 1 272 478V384A16 16 0 0 0 240 384V478A22 22 0 0 1 196 478ZM66 160H96A20 20 0 0 1 116 180V376A20 20 0 0 1 96 396H66A20 20 0 0 1 46 376V180A20 20 0 0 1 66 160ZM416 160H446A20 20 0 0 1 466 180V376A20 20 0 0 1 446 396H416A20 20 0 0 1 396 376V180A20 20 0 0 1 416 160Z" },
  // Skill cards and the sheet's Skills title: a pencil crossed over a
  // wrench, traced from Ethan's icon
  skill: { viewBox: "0 0 512 512", d: "M7.6 45.6L134.1 85.9L47.9 172.1ZM115.7 138.2L151.1 102.8L407.1 358.8L371.7 394.2ZM64.8 189.1L100.2 153.7L356.2 409.7L320.8 445.1ZM424 375.8L436.1 387.8A61 61 0 0 1 349.8 474.1L337.8 462ZM262 187L300 150L300 75L372 5L432 16L378 70L378 132L437 130L490 82L507 128L434 212L322 246ZM208.4 359.5L162.7 405.2A65 65 0 1 1 102.1 347L149 300.1ZM131.1 411.8A33 33 0 1 0 65.1 411.8A33 33 0 1 0 131.1 411.8Z" },
  // The sheet's Items title, Font Awesome Pro's solid backpack
  backpack: { viewBox: "0 0 448 512", d: "M320 320H128c-17.62 0-32 14.38-32 32v32h256v-32C352 334.4 337.6 320 320 320zM96 512h256v-96H96V512zM320 80h-8V56C312 25.12 286.9 0 256 0H192C161.1 0 136 25.12 136 56V80H128c-70.75 0-128 57.25-128 128V448c0 35.38 28.62 64 64 64v-160c0-35.25 28.75-64 64-64h192c35.25 0 64 28.75 64 64v160c35.38 0 64-28.62 64-64V208C448 137.2 390.8 80 320 80zM184 56C184 51.62 187.6 48 192 48h64c4.375 0 8 3.625 8 8V80h-80V56zM320 200c0 4.375-3.625 8-8 8h-176C131.6 208 128 204.4 128 200v-16C128 179.6 131.6 176 136 176h176C316.4 176 320 179.6 320 184V200z" },
  // Movement, Font Awesome Pro's solid person-running
  coins: { viewBox: "0 0 512 512", d: "M512 80C512 98.01 497.7 114.6 473.6 128C444.5 144.1 401.2 155.5 351.3 158.9C347.7 157.2 343.9 155.5 340.1 153.9C300.6 137.4 248.2 128 192 128C183.7 128 175.6 128.2 167.5 128.6L166.4 128C142.3 114.6 128 98.01 128 80C128 35.82 213.1 0 320 0C426 0 512 35.82 512 80V80zM160.7 161.1C170.9 160.4 181.3 160 192 160C254.2 160 309.4 172.3 344.5 191.4C369.3 204.9 384 221.7 384 240C384 243.1 383.3 247.9 381.9 251.7C377.3 264.9 364.1 277 346.9 287.3C346.9 287.3 346.9 287.3 346.9 287.3C346.8 287.3 346.6 287.4 346.5 287.5L346.5 287.5C346.2 287.7 345.9 287.8 345.6 288C310.6 307.4 254.8 320 192 320C132.4 320 79.06 308.7 43.84 290.9C41.97 289.9 40.15 288.1 38.39 288C14.28 274.6 0 258 0 240C0 205.2 53.43 175.5 128 164.6C138.5 163 149.4 161.8 160.7 161.1L160.7 161.1zM391.9 186.6C420.2 182.2 446.1 175.2 468.1 166.1C484.4 159.3 499.5 150.9 512 140.6V176C512 195.3 495.5 213.1 468.2 226.9C453.5 234.3 435.8 240.5 415.8 245.3C415.9 243.6 416 241.8 416 240C416 218.1 405.4 200.1 391.9 186.6V186.6zM384 336C384 354 369.7 370.6 345.6 384C343.8 384.1 342 385.9 340.2 386.9C304.9 404.7 251.6 416 192 416C129.2 416 73.42 403.4 38.39 384C14.28 370.6 .0003 354 .0003 336V300.6C12.45 310.9 27.62 319.3 43.93 326.1C83.44 342.6 135.8 352 192 352C248.2 352 300.6 342.6 340.1 326.1C347.9 322.9 355.4 319.2 362.5 315.2C368.6 311.8 374.3 308 379.7 304C381.2 302.9 382.6 301.7 384 300.6L384 336zM416 278.1C434.1 273.1 452.5 268.6 468.1 262.1C484.4 255.3 499.5 246.9 512 236.6V272C512 282.5 507 293 497.1 302.9C480.8 319.2 452.1 332.6 415.8 341.3C415.9 339.6 416 337.8 416 336V278.1zM192 448C248.2 448 300.6 438.6 340.1 422.1C356.4 415.3 371.5 406.9 384 396.6V432C384 476.2 298 512 192 512C85.96 512 .0003 476.2 .0003 432V396.6C12.45 406.9 27.62 415.3 43.93 422.1C83.44 438.6 135.8 448 192 448z" },
  "person-running": { viewBox: "0 0 448 512", d: "M400 224h-44l-26.12-53.25c-12.5-25.5-35.38-44.25-61.75-51L197 98.63C189.5 96.84 181.1 95.97 174.5 95.97c-20.88 0-41.33 6.81-58.26 19.78L76.5 146.3C68.31 152.5 64.01 162 64.01 171.6c0 17.11 13.67 32.02 32.02 32.02c6.808 0 13.67-2.158 19.47-6.616l39.63-30.38c5.92-4.488 13.01-6.787 19.53-6.787c2.017 0 3.981 .2196 5.841 .6623l14.62 4.25l-37.5 87.5C154.1 260.3 152.5 268.8 152.5 277.2c0 22.09 11.49 43.52 31.51 55.29l85 50.13l-27.5 87.75c-.9875 3.174-1.458 6.388-1.458 9.55c0 13.65 8.757 26.31 22.46 30.58C265.6 511.5 268.9 512 272 512c13.62 0 26.25-8.75 30.5-22.5l31.75-101c1.211-4.278 1.796-8.625 1.796-12.93c0-16.57-8.661-32.51-23.55-41.44l-61.13-36.12l31.25-78.38l20.25 41.5C310.9 277.4 327.9 288 345.1 288H400c17.62 0 32-14.38 32-32C432 238.3 417.6 224 400 224zM288 96c26.5 0 48-21.5 48-48s-21.5-48-48-48s-48 21.5-48 48S261.5 96 288 96zM129.8 317.5L114.9 352H48c-17.62 0-32 14.38-32 32s14.38 32 32 32h77.5c19.25 0 36.5-11.5 44-29.12l8.875-20.5l-10.75-6.25C150.4 349.9 137.6 334.8 129.8 317.5z" },
  // Resistances' badge, Font Awesome Pro's solid shield
  shield: { viewBox: "0 0 512 512", d: "M466.5 83.71l-192-80C269.6 1.67 261.3 0 256 0C250.7 0 242.5 1.67 237.6 3.702l-192 80C27.7 91.1 16 108.6 16 127.1c0 257.2 189.2 384 239.1 384c51.1 0 240-128.2 240-384C496 108.6 484.3 91.1 466.5 83.71zM256 446.5l.0234-381.1c.0059-.0234 0 0 0 0l175.9 73.17C427.8 319.7 319 417.1 256 446.5z" },
  // Damage badges: crosshairs for ranged and thrown weapons, a sword for the rest
  crosshairs: { viewBox: "0 0 512 512", d: "M224 256C224 238.3 238.3 224 256 224C273.7 224 288 238.3 288 256C288 273.7 273.7 288 256 288C238.3 288 224 273.7 224 256zM256 0C273.7 0 288 14.33 288 32V42.35C381.7 56.27 455.7 130.3 469.6 224H480C497.7 224 512 238.3 512 256C512 273.7 497.7 288 480 288H469.6C455.7 381.7 381.7 455.7 288 469.6V480C288 497.7 273.7 512 256 512C238.3 512 224 497.7 224 480V469.6C130.3 455.7 56.27 381.7 42.35 288H32C14.33 288 0 273.7 0 256C0 238.3 14.33 224 32 224H42.35C56.27 130.3 130.3 56.27 224 42.35V32C224 14.33 238.3 0 256 0V0zM224 404.6V384C224 366.3 238.3 352 256 352C273.7 352 288 366.3 288 384V404.6C346.3 392.1 392.1 346.3 404.6 288H384C366.3 288 352 273.7 352 256C352 238.3 366.3 224 384 224H404.6C392.1 165.7 346.3 119.9 288 107.4V128C288 145.7 273.7 160 256 160C238.3 160 224 145.7 224 128V107.4C165.7 119.9 119.9 165.7 107.4 224H128C145.7 224 160 238.3 160 256C160 273.7 145.7 288 128 288H107.4C119.9 346.3 165.7 392.1 224 404.6z" },
  // A Max Range badge: a dashed arc to a target
  range: { viewBox: "2.57 -59.10 265.44 265.44", d: "M171.56 3.16L187.05 7.34A12.12095 12.12095 0 0 1 180.72 30.75L165.24 26.56A12.12095 12.12095 0 0 1 171.56 3.16ZM92.10 9.38L107.22 4.04A12.12155 12.12155 0 0 1 115.30 26.90L100.18 32.24A12.12155 12.12155 0 0 1 92.10 9.38ZM2.93 129.46L6.80 113.89A12.12155 12.12155 0 0 1 30.32 119.74L26.45 135.31A12.12155 12.12155 0 0 1 2.93 129.46ZM31.99 59.53L41.61 46.70A12.12155 12.12155 0 0 1 61.01 61.24L51.39 74.08A12.12155 12.12155 0 0 1 31.99 59.53ZM207.93 56.74A30.0361 30.0361 0 1 0 268.01 56.74A30.0361 30.0361 0 1 0 207.93 56.74Z" },
  // An Area of Effect badge: a burst with flying shards
  burst: { viewBox: "135.5 153 830 830", d: "M282.5 982C284 981.4 289.1 977.7 293.9 973.7C298.6 969.7 308.4 961.5 315.5 955.5C322.6 949.6 330.1 943.3 332.1 941.6C336 938.2 336.5 937.8 350.2 926.3C377.5 903.6 390 892.8 391.9 890.4C396.5 884.6 396.5 881.4 392 858.5C390.5 851 389.1 843.5 387.7 836C385.2 822.1 380.8 816.6 372.3 816.6C369.6 816.7 365.5 817.6 363 818.7C360.5 819.9 349.5 824.5 338.5 829C312.5 839.7 312.5 839.7 306 859.1C303.3 867 296.1 888.1 290 906C268.3 969.6 267.8 971 268.5 973.9C268.8 975.5 270.3 977.9 271.8 979.2C275.9 983.1 278.2 983.6 282.5 982ZM478.8 947.4C482.2 945.5 486.2 940.2 487.5 936C487.9 934.6 489.3 931.2 490.5 928.5C491.8 925.8 500.5 904.8 510 882C519.4 859.2 528 838.6 529.1 836.3C530.1 834 531 831.9 531 831.5C531 831.2 532 828.8 533.1 826.2C538.2 814.9 539 813 539 812.5C539 812.1 539.9 810 540.9 807.7C542 805.4 546.1 795.6 550 786C559.2 763.7 559.3 763.5 563.8 760.5C569.2 756.9 575.6 756.3 581.2 758.8C583.7 759.9 599.4 770.4 616.1 782.2C632.8 794 663.1 815.3 683.5 829.6C703.9 844 736 866.6 754.9 879.9C773.8 893.2 791 905 793.1 906C804.7 912 818.3 903.4 818.3 890.3C818.3 887.3 817.8 883.9 817.2 882.7C815.1 878.1 813 873.2 813 872.6C813 872.3 812.1 870.1 811.1 867.7C805.8 856 726.9 663.5 726.4 661.1C725.5 656.6 727.8 650.2 731.9 646.1C735.4 642.6 739.1 641.2 809.1 618.1C923.1 580.3 924.3 579.9 928 578C940.2 571.7 940.7 553.7 928.9 547C925.6 545.2 917.6 543.4 890 538.4C885.3 537.5 877 536 871.5 535C866 533.9 857.5 532.4 852.5 531.5C847.5 530.6 841.5 529.5 839 529C834.6 528.1 823.7 526.1 811.5 523.9C808.2 523.3 803.5 522.5 801 522C798.5 521.5 792.5 520.4 787.5 519.5C782.5 518.6 776.5 517.5 774 517C771.5 516.5 765.5 515.4 760.5 514.5C734.9 509.9 730.6 508.3 727 502.5C722.2 494.6 723.4 488 732.5 474.9C736 469.7 742.7 459.9 747.4 453C752 446.1 762.7 430.4 771.2 418C779.7 405.6 791 389 796.5 381C843.3 312.3 840 317.5 840 312.5C840 306.5 837.5 300.6 833.7 297.7C829.3 294.4 822.8 292.9 818.2 294.2C814.2 295.2 813.6 295.5 798.5 302.5C793 305.1 785.8 308.5 782.5 310C770.4 315.6 761.4 319.8 756 322.3C753 323.7 747.1 326.4 743 328.3C738.9 330.2 731.5 333.7 726.5 336C653.3 370 636.1 378 633.7 378.5C628.7 379.8 622.5 378.2 618.1 374.3C613.7 370.6 612.4 368.3 611 361.5C609.9 355.9 605.5 334.7 602.5 320.5C601.1 313.9 598.9 303.1 597.5 296.5C596.2 289.9 594.1 280.2 593 275C591.9 269.8 589.9 260.1 588.5 253.5C587.1 246.9 585.2 237.4 584.1 232.5C583 227.6 581.4 219.9 580.5 215.5C577.1 198.8 573.2 194.5 561.4 194.5C548.9 194.5 549.6 193.5 516.5 262.5C513.6 268.6 504.6 287 496.5 303.5C488.4 320 480.7 335.8 479.5 338.6C474.2 349.9 463.6 354.9 454.7 350.4C451.2 348.6 435.4 338.5 412.7 323.7C404.9 318.5 390.2 308.9 380 302.3C363.3 291.5 336.3 273.9 306.5 254.5C300.4 250.6 286.4 241.4 275.2 234.2C207.4 190.1 210.5 191.8 202.2 194.1C195.9 195.9 190.3 201.7 189.4 207.6C188.4 214.6 189.5 217.7 198.7 233.1C203.4 241 207.8 248.4 208.4 249.5C210.1 252.6 274.6 360.4 280.5 370C300.3 402.4 323.1 441.5 324.1 444.9C326.4 452.5 322 461.8 314.6 465.1C312.2 466.1 285.2 471.1 249.5 477C215.9 482.5 187.3 487.6 185.7 488.2C179.3 490.7 174.1 500.5 175.5 507.8C176.2 511.7 179.6 517.2 182.1 518.9C183.1 519.5 195.7 529 210.2 540.2C224.7 551.3 247.5 568.9 261 579.2C289.4 601 290.6 602.1 293.2 607.8C296.9 615.9 294.8 620.3 274.5 647.5C270 653.5 262 664.6 256.7 672C251.4 679.4 241.2 693.6 234 703.5C226.8 713.4 215.1 729.6 208 739.5C200.8 749.4 188.9 765.8 181.5 776C148.5 821.3 148.4 821.5 149.4 828.5C150.2 833.8 152.9 838.1 157.6 841.6C160.8 844.1 162.2 844.5 166.9 844.3C170 844.2 174.3 843.3 176.5 842.4C178.7 841.5 181.4 840.4 182.5 840C190 837.1 198.8 833.7 200.5 832.9C201.6 832.4 222.1 824.4 246 815.1C269.9 805.8 290.6 797.8 292 797.2C293.4 796.7 298.8 794.5 304 792.5C309.2 790.4 314.9 788.2 316.5 787.5C318.1 786.8 337.3 779.3 359 770.9C393.5 757.4 399.2 755.5 404.1 755.5C408.7 755.6 410.4 756.1 413.4 758.3C419.5 763 420.1 764.3 423 780.5C423.5 783.2 424.6 789.3 425.5 794C426.4 798.7 427.5 804.8 428 807.5C428.5 810.2 430.1 818.8 431.5 826.5C434.8 844.6 435.4 847.6 438.6 865C440 873 441.6 881.5 442 884C443.2 890.3 445.9 905.5 447 911.5C450.1 928.5 451 933.2 451.9 936.8C455.1 948.6 468.2 953.7 478.8 947.4ZM945.7 745C951.2 743 953.7 735.3 950.2 731.1C949.3 729.9 941.5 723.9 932.9 717.7C924.3 711.6 910.1 701.4 901.4 695.1C892.6 688.8 881.5 680.6 876.5 677C871.5 673.3 861.9 666.4 855.1 661.6C839.1 650.4 839.9 650.5 815 659.7C791.7 668.3 789.2 670 788.3 678.5C787.9 681.9 788.6 684.3 792.4 692.4C794.9 697.8 797 702.4 797 702.5C797 702.7 799.6 708.4 802.9 715.2C811.8 734.1 812.8 734.7 842.5 737C849.6 737.5 860.5 738.4 866.5 739C872.5 739.5 885.6 740.6 895.5 741.5C905.4 742.3 919.6 743.5 927 744.1C934.4 744.7 940.7 745.3 940.9 745.6C941.5 746.2 942.4 746.1 945.7 745ZM665.1 305.5C667.5 304.6 670.9 303.3 672.5 302.6C674.1 301.8 678.4 299.9 682 298.3C685.6 296.7 692.8 293.4 698.2 291C708.8 286.3 712 284 714.2 279.5C716 275.9 716.5 273.6 724.5 238.5C725.2 235.2 726.7 228.4 727.8 223.5C735 192 740 169 740.5 165.5C741.3 159.9 738.4 155.5 733.1 154C726.3 152.2 726.7 151.9 702.5 177C655.6 225.6 643.2 238.6 641.2 241.5C637.3 246.9 636.9 251.2 639.1 261.4C640.1 266.4 642.2 276.1 643.6 283C646.8 298.7 648.3 301.8 654 304.8C659.2 307.4 659.5 307.4 665.1 305.5Z" },
  sword: { viewBox: "0 0 512 512", d: "M110.1 227.6c-6.25-6.248-16.37-6.248-22.62 0l-18.75 18.75c-5.498 5.373-6.249 13.87-1.999 20.25l53.37 79.99l-53.5 53.5l-29.25-14.62c-5.375-2.748-11.75-1.623-16 2.625l-17.25 17.25c-5.5 5.375-5.5 14.25 0 19.62l82.87 82.87c5.375 5.5 14.25 5.5 19.62 0l17.25-17.25c4.25-4.25 5.375-10.62 2.625-16l-14.62-29.25l53.5-53.5l79.99 53.41c6.375 4.25 14.87 3.5 20.25-2l18.75-18.79c6.25-6.25 6.25-16.37 0-22.62L110.1 227.6zM493.7 .1497l-93.74 15.88L171.9 244.1l95.99 95.99l228.1-228.1l15.87-93.75C513.3 7.781 504.2-1.35 493.7 .1497z" },
  // The core Stats, as in the Mechanics page's stat diagram: game-icons.net's muscle-up,
  // a speaking head traced from Ethan's image, Font Awesome Free's brain, and
  // Font Awesome Pro's solid wand-magic-sparkles
  physical: { viewBox: "0 0 512 512", d: "M165.906 18.688C15.593 59.28-42.187 198.55 92.72 245.375h-1.095c.635.086 1.274.186 1.906.28 8.985 3.077 18.83 5.733 29.532 7.94C173.36 273.35 209.74 321.22 212.69 368c-33.514 23.096-59.47 62.844-59.47 62.844l26.28 38.686L138.28 493h81.97c-40.425-40.435-11.76-85.906 36.125-85.906 48.54 0 73.945 48.112 36.156 85.906h81.126l-40.375-23.47 26.283-38.686s-26.376-40.4-60.282-63.406c3.204-46.602 39.5-94.167 89.595-113.844 10.706-2.207 20.546-4.86 29.53-7.938.633-.095 1.273-.195 1.908-.28h-1.125c134.927-46.82 77.163-186.094-73.157-226.69-40.722 39.37 6.54 101.683 43.626 56.877 36.9 69.08 8.603 127.587-72.28 83.406-11.88 24.492-34.213 41.374-60.688 41.374-26.703 0-49.168-17.167-60.97-42-81.774 45.38-110.512-13.372-73.437-82.78 37.09 44.805 84.35-17.508 43.626-56.876zm90.79 35.92c-27.388 0-51.33 27.556-51.33 63.61 0 36.056 23.942 62.995 51.33 62.995 27.387 0 51.327-26.94 51.327-62.994 0-36.058-23.94-63.61-51.328-63.61z" },
  social: { viewBox: "230 70 1090 1090", d: "M372 1107H750Q778 1107 781 1079L796 967L912 980Q982 986 1001 888Q1003 870 985 864Q935 850 910 808Q906 795 922 796L985 796Q1005 794 1004 774L999 706H1045Q1097 701 1094 650Q1092 638 1086 627L1018 495Q1004 465 999 430Q970 255 860 175Q760 106 620 112Q440 116 330 220Q235 315 238 480Q240 640 340 750Q378 794 372 852L343 1070Q341 1104 372 1107ZM868 431A52 52 0 1 1 868 535A52 52 0 1 1 868 431ZM1162.8 698.6A138 138 0 0 1 1162.8 919.4A28 28 0 0 1 1129.2 874.6A82 82 0 0 0 1129.2 743.4A28 28 0 0 1 1162.8 698.6ZM1233.2 633.8A233 233 0 0 1 1233.2 987.2A28 28 0 0 1 1196.8 944.8A177 177 0 0 0 1196.8 676.2A28 28 0 0 1 1233.2 633.8Z" },
  mental: { viewBox: "64 64 512 512", d: "M184 120C184 89.1 209.1 64 240 64L264 64C281.7 64 296 78.3 296 96L296 544C296 561.7 281.7 576 264 576L232 576C202.2 576 177.1 555.6 170 528C169.3 528 168.7 528 168 528C123.8 528 88 492.2 88 448C88 430 94 413.4 104 400C84.6 385.4 72 362.2 72 336C72 305.1 89.6 278.2 115.2 264.9C108.1 252.9 104 238.9 104 224C104 179.8 139.8 144 184 144L184 120zM456 120L456 144C500.2 144 536 179.8 536 224C536 239 531.9 253 524.8 264.9C550.5 278.2 568 305 568 336C568 362.2 555.4 385.4 536 400C546 413.4 552 430 552 448C552 492.2 516.2 528 472 528C471.3 528 470.7 528 470 528C462.9 555.6 437.8 576 408 576L376 576C358.3 576 344 561.7 344 544L344 96C344 78.3 358.3 64 376 64L400 64C430.9 64 456 89.1 456 120z" },
  magic: { viewBox: "0 0 576 512", d: "M248.8 4.994C249.9 1.99 252.8 .0001 256 .0001C259.2 .0001 262.1 1.99 263.2 4.994L277.3 42.67L315 56.79C318 57.92 320 60.79 320 64C320 67.21 318 70.08 315 71.21L277.3 85.33L263.2 123C262.1 126 259.2 128 256 128C252.8 128 249.9 126 248.8 123L234.7 85.33L196.1 71.21C193.1 70.08 192 67.21 192 64C192 60.79 193.1 57.92 196.1 56.79L234.7 42.67L248.8 4.994zM427.4 14.06C446.2-4.686 476.6-4.686 495.3 14.06L529.9 48.64C548.6 67.38 548.6 97.78 529.9 116.5L148.5 497.9C129.8 516.6 99.38 516.6 80.64 497.9L46.06 463.3C27.31 444.6 27.31 414.2 46.06 395.4L427.4 14.06zM461.4 59.31L356.3 164.3L379.6 187.6L484.6 82.58L461.4 59.31zM7.491 117.2L64 96L85.19 39.49C86.88 34.98 91.19 32 96 32C100.8 32 105.1 34.98 106.8 39.49L128 96L184.5 117.2C189 118.9 192 123.2 192 128C192 132.8 189 137.1 184.5 138.8L128 160L106.8 216.5C105.1 221 100.8 224 96 224C91.19 224 86.88 221 85.19 216.5L64 160L7.491 138.8C2.985 137.1 0 132.8 0 128C0 123.2 2.985 118.9 7.491 117.2zM359.5 373.2L416 352L437.2 295.5C438.9 290.1 443.2 288 448 288C452.8 288 457.1 290.1 458.8 295.5L480 352L536.5 373.2C541 374.9 544 379.2 544 384C544 388.8 541 393.1 536.5 394.8L480 416L458.8 472.5C457.1 477 452.8 480 448 480C443.2 480 438.9 477 437.2 472.5L416 416L359.5 394.8C354.1 393.1 352 388.8 352 384C352 379.2 354.1 374.9 359.5 373.2z" },
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
        <Button round="lg" onClick={() => onChange(Math.max(1, level - 1))} disabled={disabled || level <= 1} aria-label="Lower Level">
          <Sign is="minus" />
        </Button>
        <span className="num" aria-live="polite">
          {level}
        </span>
        <Button round="lg" onClick={() => onChange(Math.min(MAX_LEVEL, level + 1))} disabled={disabled || level >= MAX_LEVEL} aria-label="Raise Level">
          <Sign is="plus" />
        </Button>
      </div>
    </div>
  );
}
