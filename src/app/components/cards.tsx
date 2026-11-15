import { Fragment, useId, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import type { Item as StockItem, Kind, Trait } from "../../schema/index.js";
import { parseDamage } from "../../engine/damage.js";
import { BASE_HP } from "../../engine/validate.js";
import { itemBadges, itemUses } from "../items.js";
import { parseResistances } from "../resistances.js";
import { damageIcon } from "./Resistances.js";
import { StatBlock, type BlockGroup } from "./stats.js";
import { Button } from "./Button.js";
import { Icon, SettingIcon, Sign, title, traitName } from "./ui.js";

// The card components: one per kind of card, so a new card can't drift from
// the others.
//
//   TraitCard       Knowledges, Languages, Skills, Abilities and spells,
//                   Conditions, Circumstances and Other Traits
//   ItemCard        Weapons, wearables, equipment and natural weapons
//   ChassisCard     An AI Core's chassis: an Item card holding Physical
//                   stats and Traits
//   KindCard        Kinds, in a framed card of their own
//   BackgroundCard  Origins, Professions and Pasts
//
// These, the Character Creator's and Player Tools', are the reference for
// every Strange Frontiers card. The site draws the same markup from
// php/rpg/components/cards.php (sf_card_trait, sf_card_item, sf_card_kind,
// sf_card_background), styled by the same stylesheet: src/app/cards.css
// here, css/sf-cards.css (a copy) there.
//
// Each card takes options that say how it behaves in the interface that
// draws it, under the same names on both sides:
//
//   Trait card       fold  opens and closes from the chevron at the end of
//                          its bar, and only there
//                    keep  what stays in view while it's closed (an
//                          Ability's effect)
//   Item card        count how many, in a circle on its left edge
//                    equip its Equip box: live (onChange) or read-only
//                    fold  opens and closes from its chevron, and only there
//                    edit  Edit and Remove, and the fields to edit it
//                    note  Note, and its field
//                    body  More of the card, under its description
//   Background card  select  a card to pick, in a radio group
//
// A card without fold is always open. The site's pages are static, so there
// the live options (equip's onChange, edit, note, select) don't exist; it
// draws the same card read-only. Picker states ride on the markup as extra
// classes: .selected and .rejected on a picker's card.

// The kind of Trait card, which sets its category and, for a Condition, its
// gray bar
export type TraitCardKind = "knowledge" | "language" | "skill" | "ability" | "condition" | "circumstance" | "other";

// A Trait's card kind from its category: Memberships are Circumstances, and
// starters fall under Other.
export function traitCardKind(t: Pick<Trait, "category" | "types"> | undefined): TraitCardKind {
  if (!t) return "other";
  if (t.category === "membership") return "circumstance";
  if (t.category === "starter") return "other";
  return t.category;
}

// The kinds of Trait card shown by an icon before the name, in place of a
// category chip
export const KIND_ICON: Partial<Record<TraitCardKind, { icon: "knowledge" | "language" | "skill" | "ability" | "condition"; label: string }>> = {
  knowledge: { icon: "knowledge", label: "Knowledge" },
  language: { icon: "language", label: "Language" },
  skill: { icon: "skill", label: "Skill" },
  ability: { icon: "ability", label: "Ability" },
  condition: { icon: "condition", label: "Condition" },
};

// Isekai's cards take Dreft's green bar and edge
export const cardRegionClass = (plane: string | undefined) => (plane === "isekai" ? " sf-card--dreft" : "");

// A chip on a card: plain (a category or a slot), muted (flags and settings),
// accent (what a background gives) or bad (something missing)
export function CardChip({ children, tone }: { children: ReactNode; tone?: "muted" | "accent" | "bad" }) {
  return <span className={`sf-chip${tone ? ` sf-chip--${tone}` : ""}`}>{children}</span>;
}

// A card's note: where a Trait came from, how long a Condition lasts, what
// a Trait needs
export function CardNote({ children }: { children: ReactNode }) {
  return <p className="sf-card-note">{children}</p>;
}

// The chevron that opens and closes a folding card: the only place that does
function Chevron({ open, label, onToggle, className }: { open: boolean; label: string; onToggle: () => void; className: string }) {
  return (
    <button type="button" className={`sf-btn sf-btn--bare ${className}`} aria-label={`${open ? "Collapse" : "Expand"} ${label}`} aria-expanded={open} title={open ? "Collapse" : "Expand"} onClick={onToggle}>
      <svg className={className === "sf-card-fold" ? "sf-card-chevron" : undefined} viewBox="0 0 12 8" aria-hidden="true" focusable="false">
        <path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}

// A folding card's classes: open or closed
const foldClass = (fold: { open: boolean } | undefined) => (fold ? (fold.open ? " is-open" : " is-closed") : "");

/**
 * A Trait card: the name bar (its kind's icon, so far a Knowledge's
 * mortarboard, a Language's speech bubbles, a Skill's pencil and wrench,
 * an Ability's weightlifter or a Condition's figure in its viewfinder; then
 * its Rank in a rounded square, the setting's mark, the name, then `chips`
 * at the right), then the body (`children`).
 *
 * fold     Opens and closes from the chevron at the end of the bar.
 * keep     Stays in view while it's closed, before the rest (an Ability's
 *          effect). Without it a closed card is its bar alone.
 * actions  Buttons at the bar's right, like a Condition's ✕.
 * as, rootProps  Let a picker draw it as a list item it can check.
 */
export function TraitCard({
  kind,
  name,
  rank,
  plane,
  chips,
  fold,
  keep,
  actions,
  className = "",
  as: Root = "div",
  rootProps,
  children,
}: {
  kind: TraitCardKind;
  name: ReactNode;
  rank?: number;
  plane?: string;
  chips?: ReactNode;
  fold?: { open: boolean; onToggle: () => void; label: string };
  keep?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: "div" | "li";
  rootProps?: HTMLAttributes<HTMLElement> & Record<`aria-${string}`, unknown>;
  children?: ReactNode;
}) {
  const hasChips = chips !== undefined && chips !== null && chips !== false;
  const classes = `sf-card sf-trait-card sf-trait-card--${kind}${cardRegionClass(plane)}${foldClass(fold)}${keep ? " has-keep" : ""}${className ? ` ${className}` : ""}`;
  return (
    <Root className={classes} {...rootProps}>
      <div className="sf-card-bar">
        <span className="sf-card-name">
          {KIND_ICON[kind] && <Icon name={KIND_ICON[kind].icon} label={KIND_ICON[kind].label} className="sf-card-kind-icon" />}
          {rank !== undefined && (
            <span className="sf-card-rank" title={`Rank ${rank}`} aria-label={`Rank ${rank}`}>
              {rank}
            </span>
          )}
          <SettingIcon plane={plane} />
          {name}
        </span>
        {(hasChips || fold || actions) && (
          <span className="sf-card-chips">
            {chips}
            {fold && <Chevron {...fold} className="sf-card-fold" />}
            {actions}
          </span>
        )}
      </div>
      <div className="sf-card-body">
        {keep}
        {fold ? <div className="sf-card-more">{children}</div> : children}
      </div>
    </Root>
  );
}

// How itemBadges words a weapon's reach, like "Max Range: 30 m": on the top
// line as badges, so left out of the open card's chips
const MAX_RANGE = "Max Range: ";
const AREA = "Area of Effect: ";

// A stock item's damage, Max Range, Area of Effect and resistances as
// badges. Each starts with a circle on its left edge: crosshairs for a
// ranged or thrown weapon's damage, a sword for any other's, an arc for its
// Max Range, a burst for its Area of Effect, a shield for resistances. Then
// each damage type's icon and number, all in one badge, with "or" between a
// damage choice's options. Where a resistance applies, like a helmet's
// (head), is left to the item's description.
function ItemBadges({ stock, withResists = true }: { stock: StockItem; withResists?: boolean }) {
  const damage = stock.damage ? parseDamage(stock.damage) : undefined;
  const resists = withResists && stock.resistances ? parseResistances(stock.resistances, stock.name) : [];
  if (!stock.damage && !resists.length && !stock.maxRange && !stock.areaOfEffect) return null;
  const ranged = stock.tags?.some((t) => t === "ranged" || t === "thrown");
  const lead = (name: "crosshairs" | "sword" | "range" | "burst" | "shield", label: string) => (
    <span className="item-stat-lead">
      <Icon name={name} label={label} />
    </span>
  );
  const damageLead = ranged ? lead("crosshairs", "Ranged damage") : lead("sword", "Melee damage");
  return (
    <div className="equipment-stats sf-item-badges">
      {stock.damage && (
        <span className="sf-item-badge-group">
          {damage ? (
            <span className="chip equipment-stat">
              {damageLead}
              {damage.map((option, i) => (
                <Fragment key={i}>
                  {i > 0 && <span className="equipment-stat-or">or</span>}
                  {option.map((d) => (
                    <span key={d.type} className="equipment-stat-value">
                      <Icon name={damageIcon(d.type)} label={d.type} />
                      {d.amount}
                      {d.perRank && "/Rank"}
                      {d.plus && ` + ${d.plus}`}
                    </span>
                  ))}
                </Fragment>
              ))}
            </span>
          ) : (
            // Damage the badges can't read stays as written
            <span className="chip equipment-stat">
              {damageLead}
              {stock.damage}
            </span>
          )}
        </span>
      )}
      {stock.maxRange && (
        <span className="sf-item-badge-group">
          <span className="chip equipment-stat" title="Max Range">
            {lead("range", "Max Range")}
            <span className="equipment-stat-value">{stock.maxRange}</span>
          </span>
        </span>
      )}
      {stock.areaOfEffect && (
        <span className="sf-item-badge-group">
          <span className="chip equipment-stat" title="Area of Effect">
            {lead("burst", "Area of Effect")}
            <span className="equipment-stat-value">{stock.areaOfEffect}</span>
          </span>
        </span>
      )}
      {resists.length > 0 && <ResistBadge stock={stock} />}
    </div>
  );
}

// An item's resistances as one badge, led by a shield
function ResistBadge({ stock }: { stock: StockItem }) {
  const resists = stock.resistances ? parseResistances(stock.resistances, stock.name) : [];
  if (!resists.length) return null;
  return (
    <span className="sf-item-badge-group">
      <span className="chip equipment-stat">
        <span className="item-stat-lead">
          <Icon name="shield" label="Resists" />
        </span>
        {resists.map((r, i) => (
          <span key={i} className="equipment-stat-value">
            <Icon name={damageIcon(r.type)} label={r.type} />
            {r.amount}
          </span>
        ))}
      </span>
    </span>
  );
}

const RESOURCE_TITLES = { hp: "Hit Points", mp: "Mana Points" } as const;

/**
 * HP or MP on an Item's top line, as the character sheet's trackers: its
 * name, −, the value over its max, +. − stops at 0; + goes past the max
 * (bonus points), and the value then takes the resource's color. A
 * chassis's HP, an enchanted Item's stored MP.
 *
 * value     Now. Full (max) without it.
 * onChange  Keeps the value elsewhere; without it the readout keeps its own.
 */
// `fixed`: the value alone, without − and + (a Game Master's view)
export function ItemResource({
  kind,
  max,
  value,
  onChange,
  fixed,
}: {
  kind: "hp" | "mp";
  max: number;
  value?: number;
  onChange?: (value: number) => void;
  fixed?: boolean;
}) {
  const [own, setOwn] = useState(value ?? max);
  const cur = onChange || fixed ? (value ?? max) : own;
  const set = onChange ?? setOwn;
  const name = kind.toUpperCase();
  return (
    <span className={`equipment-mp equipment-resource equipment-${kind}`}>
      <strong className={`resource-name resource-${kind}`} title={RESOURCE_TITLES[kind]}>
        {name}
      </strong>
      {!fixed && (
        <Button round="xs" onClick={() => set(Math.max(0, cur - 1))} disabled={cur <= 0} aria-label={`1 less ${name}`}>
          <Sign is="minus" />
        </Button>
      )}
      <span className="num" aria-live="polite">
        <span className={`equipment-resource-now${cur > max ? ` resource-${kind}` : ""}`} title={cur > max ? `Above the max of ${max}` : undefined}>
          {cur}
        </span>
        <span className="muted"> / {max}</span>
      </span>
      {!fixed && (
        <Button round="xs" onClick={() => set(cur + 1)} aria-label={`1 more ${name}`}>
          <Sign is="plus" />
        </Button>
      )}
    </span>
  );
}

/**
 * An Item card: its top line (Equip, the name and its badges, the chevron),
 * then, open, its category, value and the like as chips, its description
 * and rules. `stock` is the game's item it is, if any; a custom item has
 * only its `name` and `category`. `children` go at the card's end, like a
 * picker's count.
 *
 * count  How many, in a circle on the card's left edge.
 * equip  Its Equip box, live with onChange, read-only without.
 * fold   Opens and closes from its chevron, and only there.
 * edit   Edit's pen and, while editing, Remove and `fields`.
 * note   Note's pen and label, and `field` while it's shown.
 * body   More of the card, under its description while it's open, like a
 *        chassis's stats and Traits.
 * badges More of the top line, after its badges, like a chassis's HP.
 * mp     An enchanted Item's stored MP, with − and + (ItemResource).
 * chips  More chips after its category, like its Kit Cost at creation.
 * resistsInChips  Its resistances badge leads the chips line instead of
 *        sitting on the top line (a chassis, whose top line holds its HP).
 */
export function ItemCard({
  name,
  stock,
  category,
  count,
  equip,
  fold,
  edit,
  note,
  body,
  badges,
  mp,
  resistsInChips,
  chips: extraChips,
  className = "",
  as: Root = "div",
  children,
}: {
  name: string;
  stock?: StockItem;
  category: string;
  count?: number;
  equip?: { checked: boolean; onChange?: (checked: boolean) => void };
  fold?: { open: boolean; onToggle: () => void };
  edit?: { editing: boolean; onToggle: () => void; onRemove: () => void; fields: ReactNode };
  note?: { shown: boolean; onToggle: () => void; field: ReactNode };
  body?: ReactNode;
  badges?: ReactNode;
  mp?: { max: number; value?: number; onChange?: (value: number) => void };
  resistsInChips?: boolean;
  chips?: string[];
  className?: string;
  as?: "div" | "li";
  children?: ReactNode;
}) {
  const open = !fold || fold.open;
  const chips = stock ? itemBadges(stock).filter((b) => !b.startsWith(MAX_RANGE) && !b.startsWith(AREA)) : [];
  const uses = stock ? itemUses(stock) : "";
  return (
    <Root className={`equipment-box sf-item-card${foldClass(fold)}${className ? ` ${className}` : ""}`}>
      {count !== undefined && (
        <span className="sf-item-count" aria-label={`${count} of ${name}`}>
          {count}
        </span>
      )}
      <div className="equipment-row sf-item-summary">
        {equip && (
          <label className="sf-item-equip" title="Equip">
            <input
              type="checkbox"
              aria-label="Equip"
              checked={equip.checked}
              disabled={!equip.onChange}
              onChange={(e) => equip.onChange?.(e.target.checked)}
            />
            <span className="sf-item-equip-label">Equip</span>
          </label>
        )}
        {/* The name and its badges, which drop under it only when they don't fit beside it */}
        <span className="sf-item-main">
          <span className="equipment-name">{name}</span>
          {stock && <ItemBadges stock={stock} withResists={!resistsInChips} />}
          {mp && <ItemResource kind="mp" {...mp} />}
          {badges}
        </span>
        {fold && <Chevron {...fold} label={name} className="sf-item-icon sf-item-expand" />}
      </div>
      {open && (
        <div className="sf-item-more">
          {edit && (
            <>
              {/* Edit, a pen in a circle on the card's right edge */}
              <button type="button" className="sf-item-edge sf-item-edit" aria-label={`Edit ${name}`} title="Edit" aria-expanded={edit.editing} onClick={edit.onToggle}>
                <span className="pen-icon" aria-hidden="true" />
              </button>
              {/* In edit mode, Remove, a trash can in a circle under Edit's */}
              {edit.editing && (
                <button type="button" className="sf-item-edge sf-item-remove" aria-label={`Remove ${name}`} title="Remove" onClick={edit.onRemove}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true">
                    <path d="M135.2 17.69C140.6 6.848 151.7 0 163.8 0H284.2C296.3 0 307.4 6.848 312.8 17.69L320 32H416C433.7 32 448 46.33 448 64C448 81.67 433.7 96 416 96H32C14.33 96 0 81.67 0 64C0 46.33 14.33 32 32 32H128L135.2 17.69zM394.8 466.1C393.2 492.3 372.3 512 346.9 512H101.1C75.75 512 54.77 492.3 53.19 466.1L31.1 128H416L394.8 466.1z" />
                  </svg>
                </button>
              )}
            </>
          )}
          {/* The chips the top line leaves out: the category, then its value,
              how it Attacks and the slot it takes */}
          <div className="equipment-chips">
            {resistsInChips && stock && <ResistBadge stock={stock} />}
            <span className="chip">{title(category)}</span>
            {extraChips?.map((c) => (
              <span key={c} className="chip">
                {c}
              </span>
            ))}
            {chips.map((b) => (
              <span key={b} className="chip">
                {b}
              </span>
            ))}
          </div>
          {edit?.editing && <div className="equipment-row sf-item-fields">{edit.fields}</div>}
          {stock && (
            <div className="sf-item-stock">
              {/* The description, then the rules on their own line under it */}
              <p className="equipment-description">{stock.summary}</p>
              {uses && <p className="equipment-effect">{uses}</p>}
            </div>
          )}
          {body}
          {note && (
            <div className="sf-item-note-line">
              {/* Note, a pen and its label, opening the notes field at its right */}
              <button type="button" className="sf-btn sf-btn--bare sf-item-note-toggle" aria-expanded={note.shown} onClick={note.onToggle}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" aria-hidden="true">
                  <path d="M492.7 58.75C517.7 83.74 517.7 124.3 492.7 149.3L444.3 197.7L314.3 67.72L362.7 19.32C387.7-5.678 428.3-5.678 453.3 19.32L492.7 58.75zM58.57 323.5L291.7 90.34L421.7 220.3L188.5 453.4C178.1 463.8 165.2 471.5 151.1 475.6L30.77 511C22.35 513.5 13.24 511.2 7.03 504.1C.8198 498.8-1.502 489.7 .976 481.2L36.37 360.9C40.53 346.8 48.16 333.9 58.57 323.5L58.57 323.5zM552 464C565.3 464 576 474.7 576 488C576 501.3 565.3 512 552 512H248C234.7 512 224 501.3 224 488C224 474.7 234.7 464 248 464H552z" />
                </svg>
                Note
              </button>
              {note.shown && note.field}
            </div>
          )}
        </div>
      )}
      {children}
    </Root>
  );
}

/**
 * A Chassis card: the body an AI Core inhabits, an Item card that holds part
 * of a character sheet. Its top line is an Item card's with its HP, which
 * − and + change, as on a character sheet; its armor's resistances badge
 * leads its chips (through `stock`). Open, under its
 * description, its Physical core and focus stats as a stat block, its
 * Attacks as Item cards (`attacks`, natural weapons) and the Traits it
 * gives whoever inhabits it, as Trait cards (`traits`). Its HP sit on its
 * top line, worked out as a character's are: 10 plus its Physical focus
 * stats. An AI Core has no Physical stats of its own: its chassis's are
 * its, and so are its HP.
 *
 * physical  The Physical core stat and its focus stats.
 * hp        Its HP now, when it's taken damage; full without it.
 * hpBonus   More max HP from its Traits, like Reinforced's +10.
 * onHpChange  Keeps its HP elsewhere (Player Tools); without it the card
 *           keeps its own as its − and + change it.
 * attacks   Item cards.
 * traits    Trait cards.
 * Everything else is ItemCard's.
 */
export function ChassisCard({
  physical,
  hp,
  hpBonus = 0,
  onHpChange,
  hpFixed,
  attacks,
  traits,
  className = "",
  ...item
}: Omit<Parameters<typeof ItemCard>[0], "body" | "badges" | "resistsInChips"> & {
  physical: Omit<BlockGroup, "group">;
  hp?: number;
  hpBonus?: number;
  onHpChange?: (hp: number) => void;
  // The HP alone, without − and + (a Game Master's view)
  hpFixed?: boolean;
  attacks?: ReactNode;
  traits?: ReactNode;
}) {
  const maxHp = BASE_HP + physical.stats.reduce((sum, s) => sum + s.value, 0) + hpBonus;
  return (
    <ItemCard
      {...item}
      className={`sf-chassis-card${className ? ` ${className}` : ""}`}
      resistsInChips
      badges={<ItemResource kind="hp" max={maxHp} value={hp} onChange={onHpChange} fixed={hpFixed} />}
      body={
        <div className="sf-chassis">
          <StatBlock groups={[{ group: "physical", ...physical }]} />
          {attacks && (
            <div className="sf-chassis-list">
              <h5 className="sf-chassis-label">Attacks</h5>
              {attacks}
            </div>
          )}
          {traits && (
            <div className="sf-chassis-list">
              <h5 className="sf-chassis-label">Traits</h5>
              {traits}
            </div>
          )}
        </div>
      }
    />
  );
}

// What a Background card gives, as labeled rows of chips: Bonus, Grants,
// Choose, Background Keywords, or a Kind's Grants
export function BackgroundRows({ rows, children }: { rows: { label: string; chips: ReactNode[]; accent?: boolean }[]; children?: ReactNode }) {
  const shown = rows.filter((r) => r.chips.length > 0);
  if (!shown.length && !children) return null;
  return (
    <div className="sf-background-rows">
      {shown.map((r) => (
        <div key={r.label}>
          <span className="sf-background-label">{r.label}</span>
          {r.chips.map((c, i) => (
            <CardChip key={i} tone={r.accent ? "accent" : undefined}>
              {c}
            </CardChip>
          ))}
        </div>
      ))}
      {children}
    </div>
  );
}

/**
 * A Background card: the name with its slot and plane as chips, then the
 * body (`children`: the summary, what it gives and its features).
 *
 * select  A card to pick in a radio group, clickable and keyboard-operable,
 *         ringed in green while picked (.selected).
 */
export function BackgroundCard({
  name,
  slot,
  plane,
  select,
  className = "",
  children,
}: {
  name: string;
  slot: string;
  plane: string;
  select?: { selected: boolean; onSelect: () => void };
  className?: string;
  children: ReactNode;
}) {
  const classes = `sf-card sf-background-card${cardRegionClass(plane)}${select ? ` is-selectable${select.selected ? " selected" : ""}` : ""}${className ? ` ${className}` : ""}`;
  const onKey = (e: KeyboardEvent) => {
    if (select && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      select.onSelect();
    }
  };
  return (
    <div
      className={classes}
      {...(select ? { role: "radio", "aria-checked": select.selected, "aria-label": name, tabIndex: 0, onClick: select.onSelect, onKeyDown: onKey } : {})}
    >
      <div className="sf-card-bar">
        <h3 className="sf-card-name">
          <SettingIcon plane={plane} />
          {name}
        </h3>
        <span className="sf-card-chips">
          <CardChip>{slot}</CardChip>
          <CardChip tone="muted">{plane}</CardChip>
        </span>
      </div>
      <div className="sf-card-body">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Kind card: a thin gunmetal border running in to a 2px line in the
// card's key color (silver for The Settled Systems, Dreft's green for
// Isekai), around a dark field with a large quarter-circle cut out of its
// top left corner and a four-pointed star in the cut-out; the gunmetal stops
// short of the cut-out. The field holds a faded sun at the bottom whose rays
// light a column of planets from below. The site draws
// the same markup from sf_card_kind() in php/rpg/components/cards.php.

// The key color's gradient for the frame's line and star, in palette
// colors: Medium Gray to Condition Edge; solid Green for Isekai
const KIND_KEY_STOPS = {
  silver: ["#949798", "#949798", "#626466", "#626466", "#626466"],
  green: ["#47b767", "#47b767", "#47b767", "#47b767", "#47b767"],
};

// A four-pointed star
const kindStar = (cx: number, cy: number, r: number) => {
  const s = r * 0.22;
  return `M${cx} ${cy - r}L${cx + s} ${cy - s}L${cx + r} ${cy}L${cx + s} ${cy + s}L${cx} ${cy + r}L${cx - s} ${cy + s}L${cx - r} ${cy}L${cx - s} ${cy - s}Z`;
};

// The sky: a faded sun at the bottom with rays fanning out
// from it, and a column of planets above it, each the field's own color, so
// it shows only by blocking the rays and by the crescent the sun lights along
// its bottom edge. Everything is measured in the field's width (cqw), so the
// spacing never changes with the card's height: all four stack up from the
// sun with a set gap between each, and a taller card shows more of the big
// one at the top. Each
// planet is [its center, as a CSS top; its width, cqw; the crescent's
// thickness at the bottom, px]. The site's copy is in sf_card_kind_sky().
const KIND_PLANETS: [string, number, number][] = [
  ["calc(100% - 163cqw)", 112, 4],
  ["calc(100% - 90.5cqw)", 13, 2],
  ["calc(100% - 62cqw)", 24, 3],
  ["calc(100% - 35.5cqw)", 9, 2],
];

// The other card backgrounds, kept as options (KindCard's `background`):
// "compass", the first one, an eight-point compass over a faint starfield,
// and "planet", a dark planet's disc under a dense starfield. "sun", above,
// is the default.

// The compass: eight long diamonds meeting at the middle, each split down its
// length into a light and a dark face. The four cardinal ones are as wide as
// they are far from the middle at their widest, so they close over the
// middle, and the four smaller intercardinal ones come out from under them.
// The rose is turned 15° off north.
const KIND_ROSE = (() => {
  const c = 150;
  const p = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const faces: { light: string; dark: string }[] = [];
  for (const [offset, len, at, width] of [
    [45, 96, 46, 13],
    [0, 132, 24, 24],
  ]) {
    for (let i = 0; i < 4; i++) {
      const a = ((offset + i * 90 - 90) * Math.PI) / 180;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const tip = p(c + ux * len, c + uy * len);
      faces.push({
        light: `M${c} ${c}L${p(c + ux * at + uy * width, c + uy * at - ux * width)}L${tip}Z`,
        dark: `M${c} ${c}L${p(c + ux * at - uy * width, c + uy * at + ux * width)}L${tip}Z`,
      });
    }
  }
  return faces;
})();

// The starfields: one fixed sky each (top %, left %, opacity, delay in
// seconds), shifted by the Kind's id so cards side by side differ: a faint
// one for the compass, a dense one for the planet. The site's copies are in
// sf_card_kind_stars().
const KIND_DOTS_FAINT = [[32.4,15.1,0.54,0.5],[53.6,36.6,0.28,3.6],[3.7,43.4,0.28,0.6],[42.5,82.7,0.31,1.6],[62.7,94.8,0.51,2.8],[97.6,4.7,0.64,2.0],[14.4,11.8,0.39,5.7],[18.1,58.2,0.54,2.6],[54.8,6.3,0.28,1.4],[68.0,42.8,0.39,4.1],[45.3,30.0,0.61,4.9],[24.4,57.4,0.49,6.1],[72.9,28.8,0.69,0.8],[41.8,75.7,0.32,3.4],[3.9,66.8,0.59,4.0],[87.5,31.4,0.56,4.2],[58.0,45.6,0.63,6.6],[47.4,66.4,0.28,4.9],[64.7,99.3,0.62,2.0],[38.6,66.9,0.26,3.2],[16.8,11.7,0.28,5.4],[12.9,24.8,0.43,6.1],[8.1,44.9,0.5,6.2],[81.9,86.4,0.38,2.9],[35.9,88.4,0.68,1.1],[17.6,23.2,0.36,3.4],[58.9,26.3,0.25,2.9],[36.9,56.6,0.68,4.8],[51.5,61.8,0.55,0.4],[90.0,78.0,0.64,5.6],[39.2,39.9,0.3,4.4],[6.2,6.7,0.34,1.1],[34.0,5.3,0.25,1.1],[10.1,36.4,0.26,6.1],[61.4,14.9,0.36,2.4],[36.4,12.3,0.63,7.0],[46.6,48.4,0.29,0.7],[34.3,26.5,0.62,1.1],[2.3,95.1,0.49,1.0],[54.3,2.7,0.49,6.8],[86.3,69.6,0.37,2.6],[16.7,77.2,0.49,5.5],[33.0,22.3,0.62,6.9],[85.3,80.6,0.62,5.2],[22.7,51.8,0.41,0.2],[2.8,27.9,0.37,4.8]];
const KIND_DOTS_DENSE = [[16.6,36.4,0.43,4.8],[18.4,96.8,0.28,2.1],[53.8,78.7,0.34,4.7],[48.6,55.1,0.88,4.1],[58.4,25.4,0.31,4.3],[37.2,78.9,0.39,5.3],[67.7,67.4,0.59,4.5],[67.1,47.5,0.42,0.5],[10.5,99.5,0.34,4.0],[99.7,72.0,0.48,4.7],[64.5,41.3,0.25,3.9],[10.2,5.8,0.48,7.0],[40.9,19.7,0.4,3.2],[50.8,56.3,0.42,0.5],[75.0,34.5,0.35,0.0],[39.5,97.1,0.4,6.7],[2.3,59.6,0.37,0.0],[47.8,2.2,0.84,6.2],[3.9,20.8,0.39,4.0],[3.5,11.2,0.53,4.0],[94.2,19.6,0.77,4.4],[1.1,52.8,0.66,6.6],[49.7,37.5,0.29,5.7],[55.7,81.4,0.25,0.3],[35.2,77.5,0.62,4.3],[68.1,5.2,0.29,6.1],[28.5,33.6,0.25,3.1],[52.6,90.4,0.26,4.5],[50.0,91.9,0.34,2.4],[85.9,90.0,0.35,1.6],[49.4,3.5,0.45,3.4],[36.6,97.9,0.36,6.8],[43.9,17.5,0.88,4.6],[14.1,70.7,0.32,1.3],[67.3,32.2,0.45,5.3],[90.4,5.5,0.44,2.0],[46.7,37.0,0.69,2.9],[33.0,56.7,0.27,0.6],[16.5,32.9,0.65,4.5],[62.2,62.3,0.74,2.3],[58.2,46.2,0.32,3.5],[82.4,95.1,0.25,1.2],[5.9,41.7,0.28,1.7],[43.5,15.3,0.3,1.8],[9.9,84.7,0.38,5.5],[90.0,63.0,0.4,4.3],[71.9,39.9,0.47,5.4],[47.0,39.4,0.23,4.9],[31.8,27.2,0.74,2.9],[87.8,43.6,0.45,1.2],[49.0,92.0,0.26,6.0],[10.7,17.9,0.84,2.4],[55.5,11.1,0.33,3.4],[92.3,8.9,0.22,5.5],[72.6,61.9,0.38,1.3],[85.5,55.7,0.38,5.6],[95.8,0.3,0.26,2.6],[10.3,2.7,0.28,0.5],[63.0,20.1,0.36,2.3],[91.9,17.5,0.38,2.1],[24.0,66.4,0.38,3.7],[51.8,42.2,0.9,3.1],[86.0,50.8,0.47,2.8],[96.4,41.1,0.41,0.7],[15.5,23.4,0.23,3.7],[30.3,64.3,0.53,1.2],[63.6,37.1,0.81,5.3],[4.7,23.4,0.23,0.8],[21.5,92.5,0.2,1.2],[39.3,98.5,0.82,6.4],[63.2,96.8,0.34,5.0],[80.4,19.2,0.8,2.2],[79.3,37.4,0.41,1.9],[1.7,24.7,0.49,6.6],[20.0,50.3,0.21,1.8],[65.6,98.6,0.24,0.4],[37.1,53.1,0.35,6.5],[21.5,21.8,0.45,4.0],[43.9,28.7,0.35,0.1],[90.7,67.6,0.23,6.6],[59.8,96.3,0.32,3.0],[37.7,67.1,0.36,1.1],[54.6,90.1,0.4,6.2],[18.3,69.7,0.71,4.0],[74.4,43.9,0.4,2.9],[64.8,73.2,0.8,1.7],[0.6,62.8,0.23,1.4],[40.1,39.3,0.41,3.8],[70.7,28.8,0.77,0.2],[57.8,90.4,0.32,0.7],[47.8,84.6,0.48,0.8],[34.6,16.5,0.88,6.9],[93.3,31.0,0.26,5.6],[24.7,58.0,0.68,6.9],[16.9,93.2,0.32,0.9],[20.9,60.3,0.23,1.7],[43.0,55.0,0.26,1.2],[46.8,33.4,0.85,5.0],[2.2,6.9,0.25,5.2],[14.8,18.4,0.25,4.6],[94.2,46.5,0.28,3.6],[24.8,52.9,0.28,5.4],[20.2,80.8,0.58,7.0],[95.4,73.8,0.38,5.3],[67.2,92.6,0.9,3.0],[26.9,44.5,0.41,2.5],[78.6,94.7,0.25,1.8],[42.3,19.9,0.22,0.3],[52.6,17.1,0.37,6.3],[24.8,93.6,0.22,6.9],[8.7,95.9,0.56,5.4],[29.3,98.8,0.74,1.5],[85.9,13.0,0.79,2.5],[12.7,39.9,0.27,1.7],[64.4,18.2,0.26,1.2],[41.7,13.9,0.42,1.3],[10.3,47.5,0.42,1.0],[82.2,28.4,0.73,4.7],[80.0,61.0,0.31,1.0],[36.7,16.0,0.32,0.1],[78.7,37.8,0.32,4.6],[36.5,12.2,0.21,5.4],[27.2,45.0,0.41,2.7],[70.5,95.1,0.32,4.8],[66.7,67.5,0.42,6.8],[86.4,41.8,0.33,3.6],[48.7,69.8,0.7,1.5],[25.4,43.8,0.29,3.7],[40.9,51.8,0.3,6.4],[99.9,79.5,0.42,1.3],[16.6,83.0,0.28,1.3],[78.2,91.7,0.75,4.7],[91.5,59.2,0.21,2.0],[32.3,85.6,0.23,5.7],[48.5,19.5,0.25,1.2],[30.5,99.8,0.3,5.8],[18.3,16.6,0.45,4.0],[12.2,1.5,0.27,3.8],[71.8,67.8,0.22,5.0],[53.2,94.3,0.44,4.3],[22.6,34.8,0.67,4.0],[89.9,12.7,0.38,6.1],[45.4,14.6,0.42,1.2],[32.5,1.0,0.22,1.0],[27.1,39.2,0.41,1.5],[44.7,83.8,0.22,5.7],[57.2,66.1,0.87,6.1],[98.4,5.9,0.28,6.9],[82.2,23.5,0.22,6.5],[54.8,97.7,0.27,5.4],[1.4,56.0,0.81,1.4],[11.2,19.5,0.41,4.5],[10.2,18.0,0.42,3.9],[21.5,2.8,0.26,4.5],[85.3,26.8,0.3,4.7],[0.3,88.4,0.62,3.4],[14.4,44.3,0.32,1.5],[77.9,38.8,0.6,5.9],[20.4,57.8,0.3,4.2],[12.5,40.5,0.31,0.7]];
const KIND_TWINKLES = [[88.3,45.6,11.2],[91.0,88.2,4.4],[26.5,27.1,2.4],[25.2,60.4,10.8]];

function KindStars({ seed, dense = false }: { seed: string; dense?: boolean }) {
  let sum = 0;
  for (const ch of seed) sum += ch.charCodeAt(0);
  const dy = (sum * 13) % 100;
  const dx = (sum * 29) % 100;
  const wrap = (v: number, d: number) => ((v + d) % 100).toFixed(1);
  const inner = (v: number, d: number) => (((v - 8 + d) % 84) + 8).toFixed(1);
  // Every fifth faint star is a big one, every seventh dense one
  const big = dense ? 7 : 5;
  return (
    <div className="sf-kind-stars">
      {(dense ? KIND_DOTS_DENSE : KIND_DOTS_FAINT).map(([t, l, o, delay], i) => (
        <span key={i} className={`sf-kind-dot${i % big === 0 ? " is-big" : ""}`} style={{ top: `${wrap(t, dy)}%`, left: `${wrap(l, dx)}%`, opacity: o, animationDelay: `${delay}s` }} />
      ))}
      {KIND_TWINKLES.map(([t, l, delay], i) => (
        <span key={i} className="sf-kind-twinkle" style={{ top: `${inner(t, dy)}%`, left: `${inner(l, dx)}%`, animationDelay: `${delay}s` }} />
      ))}
    </div>
  );
}

// The Kind card's background, behind its content
export type KindBackground = "sun" | "compass" | "planet";
export const KIND_BACKGROUNDS: KindBackground[] = ["sun", "compass", "planet"];

// One corner of the frame, drawn top left; CSS turns it for the others. The
// line runs 6px in from the card's edge, along the field's edge. At the top
// left it follows a 24px quarter-circle cut out of the field, with the star
// in the cut-out (the gunmetal stops short of it); the other three corners
// are simply rounded.
function KindCorner({ where, gradient }: { where: "tl" | "tr" | "bl" | "br"; gradient: string }) {
  const star = where === "tl";
  return (
    <svg className={`sf-kind-corner sf-kind-corner--${where}`} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeWidth="2" d={star ? "M100 6H30A24 24 0 0 1 6 30V100" : "M100 6H12A6 6 0 0 0 6 12V100"} />
      {star && <path fill={`url(#${gradient})`} d={kindStar(13, 13, 7.5)} />}
    </svg>
  );
}

const KIND_STAT_GROUPS = [
  ["Physical", ["endurance", "power", "grace"]],
  ["Social", ["empathy", "persuasion", "demeanor"]],
  ["Mental", ["logic", "intuition", "memory"]],
] as const;

/**
 * A Kind's card: its name and summary, each focus stat's bonus and maximum,
 * the Traits every character of the Kind holds, its features, then "Kind ✦"
 * and its setting at the foot.
 *
 * lore    Its lore line under the summary, as in the popup.
 * select  A card to pick in a radio group, clickable and keyboard-operable,
 *         ringed in green while picked (.selected).
 */
export function KindCard({
  kind: k,
  lore = false,
  select,
  background = "sun",
  className = "",
}: {
  kind: Kind;
  lore?: boolean;
  // What's drawn behind the content: the sun and planets (the default), the
  // compass or the planet
  background?: KindBackground;
  select?: { selected: boolean; onSelect: () => void };
  className?: string;
}) {
  const isekai = k.plane === "isekai";
  const key = isekai ? "green" : "silver";
  const gradient = `sf-kind-${key}-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const classes = `sf-kind-card sf-kind-card--bg-${background}${isekai ? " sf-kind-card--dreft" : ""}${select ? ` is-selectable${select.selected ? " selected" : ""}` : ""}${className ? ` ${className}` : ""}`;
  const onKey = (e: KeyboardEvent) => {
    if (select && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      select.onSelect();
    }
  };
  return (
    <article
      className={classes}
      {...(select ? { role: "radio", "aria-checked": select.selected, "aria-label": k.name, tabIndex: 0, onClick: select.onSelect, onKeyDown: onKey } : {})}
    >
      <div className="sf-kind-panel">
        <span className="sf-kind-plate" aria-hidden="true" />
        <svg className="sf-kind-defs" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">
              {KIND_KEY_STOPS[key].map((c, i) => (
                <stop key={i} offset={[0, 0.35, 0.6, 0.85, 1][i]} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
        </svg>
        <div className="sf-kind-field" aria-hidden="true">
          {background === "sun" && (
            <div className="sf-kind-sky">
              <span className="sf-kind-rays" />
              <span className="sf-kind-sun" />
              {KIND_PLANETS.map(([top, size, lit], i) => (
                <span key={i} className="sf-kind-planet" style={{ top, width: `${size}cqw`, "--lit": `${lit}px` } as CSSProperties} />
              ))}
            </div>
          )}
          {background === "compass" && (
            <>
              <KindStars seed={k.id} />
              <svg className="sf-kind-emblem" viewBox="0 0 300 300" aria-hidden="true" focusable="false">
                <circle className="sf-kind-rose-ring" cx="150" cy="150" r="142" strokeWidth="4" />
                <g transform="rotate(15 150 150)">
                  {KIND_ROSE.map((f, i) => (
                    <Fragment key={i}>
                      <path className="sf-kind-rose-light" d={f.light} />
                      <path className="sf-kind-rose-dark" d={f.dark} />
                    </Fragment>
                  ))}
                </g>
              </svg>
            </>
          )}
          {background === "planet" && (
            <>
              <KindStars seed={k.id} dense />
              <span className="sf-kind-globe" />
            </>
          )}
        </div>
        {(["tl", "tr", "bl", "br"] as const).map((w) => (
          <KindCorner key={w} where={w} gradient={gradient} />
        ))}
        <span className="sf-kind-edge sf-kind-edge--top" />
        <span className="sf-kind-edge sf-kind-edge--right" />
        <span className="sf-kind-edge sf-kind-edge--bottom" />
        <span className="sf-kind-edge sf-kind-edge--left" />
        <div className="sf-kind-content">
          <h3 className="sf-kind-name">{k.name}</h3>
          <p className="sf-kind-summary">{k.summary}</p>
          {lore && k.lore && <p className="sf-kind-lore">{k.lore}</p>}
          {k.stats && (
            <div className="sf-kind-stats">
              {KIND_STAT_GROUPS.map(([group, stats]) => (
                <div key={group}>
                  <div className={`sf-kind-label sf-kind-label--${group.toLowerCase()}`}>{group}</div>
                  {stats.map((s) => (
                    <div key={s} className="sf-kind-stat">
                      <abbr title={title(s)}>{title(s.slice(0, 3))}</abbr>
                      <span className="sf-kind-num">
                        +{k.stats[s]?.bonus ?? 0}
                        <span>/{k.stats[s]?.max ?? 0}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {k.grants.length > 0 && (
            <div className="sf-kind-grants">
              <span className="sf-kind-label">Grants</span>
              {k.grants.map((g) => (
                <CardChip key={g.trait} tone="accent">
                  {traitName(g.trait)}
                </CardChip>
              ))}
            </div>
          )}
          {k.features.length > 0 && (
            <ul className="sf-kind-features">
              {k.features.map((f) => (
                <li key={f.name}>
                  <strong>{f.name}.</strong> {f.description}
                </li>
              ))}
            </ul>
          )}
          <p className="sf-kind-foot">
            Kind<span aria-hidden="true">✦</span>
            {isekai ? "Isekai" : "The Settled Systems"}
          </p>
        </div>
      </div>
    </article>
  );
}
