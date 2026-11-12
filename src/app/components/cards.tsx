import { Fragment, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import type { Item as StockItem, Trait } from "../../schema/index.js";
import { parseDamage } from "../../engine/damage.js";
import { BASE_HP } from "../../engine/validate.js";
import { itemBadges, itemUses } from "../items.js";
import { parseResistances } from "../resistances.js";
import { damageIcon } from "./Resistances.js";
import { StatBlock, type BlockGroup } from "./stats.js";
import { Button } from "./Button.js";
import { Icon, SettingIcon, Sign, title } from "./ui.js";

// The card components: one per kind of card, so a new card can't drift from
// the others.
//
//   TraitCard       Knowledges, Languages, Skills, Abilities and spells,
//                   Conditions, Circumstances and Other Traits
//   ItemCard        Weapons, wearables, equipment and natural weapons
//   ChassisCard     An AI Core's chassis: an Item card holding Physical
//                   stats and Traits
//   BackgroundCard  Kinds, Origins, Professions and Pasts
//
// These, the Character Creator's and Player Tools', are the reference for
// every Strange Frontiers card. The site draws the same markup from
// php/rpg/components/cards.php (sf_card_trait, sf_card_item,
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

// A Trait's card kind from its category: a Language is a Knowledge with the
// language type, Memberships are Circumstances, and starters
// fall under Other.
export function traitCardKind(t: Pick<Trait, "category" | "types"> | undefined): TraitCardKind {
  if (!t) return "other";
  if (t.category === "knowledge") return t.types.includes("language") ? "language" : "knowledge";
  if (t.category === "membership") return "circumstance";
  if (t.category === "starter") return "other";
  return t.category;
}

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
 * A Trait card: the name bar (the setting's mark, the name, its Rank, then
 * `chips` at the right), then the body (`children`).
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
          <SettingIcon plane={plane} />
          {name}
          {rank !== undefined ? ` (${rank})` : ""}
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
export function ItemResource({ kind, max, value, onChange }: { kind: "hp" | "mp"; max: number; value?: number; onChange?: (value: number) => void }) {
  const [own, setOwn] = useState(value ?? max);
  const cur = onChange ? (value ?? max) : own;
  const set = onChange ?? setOwn;
  const name = kind.toUpperCase();
  return (
    <span className={`equipment-mp equipment-resource equipment-${kind}`}>
      <strong className={`resource-name resource-${kind}`} title={RESOURCE_TITLES[kind]}>
        {name}
      </strong>
      <Button round="xs" onClick={() => set(Math.max(0, cur - 1))} disabled={cur <= 0} aria-label={`1 less ${name}`}>
        <Sign is="minus" />
      </Button>
      <span className="num" aria-live="polite">
        <span className={`equipment-resource-now${cur > max ? ` resource-${kind}` : ""}`} title={cur > max ? `Above the max of ${max}` : undefined}>
          {cur}
        </span>
        <span className="muted"> / {max}</span>
      </span>
      <Button round="xs" onClick={() => set(cur + 1)} aria-label={`1 more ${name}`}>
        <Sign is="plus" />
      </Button>
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
  attacks,
  traits,
  className = "",
  ...item
}: Omit<Parameters<typeof ItemCard>[0], "body" | "badges" | "resistsInChips"> & {
  physical: Omit<BlockGroup, "group">;
  hp?: number;
  hpBonus?: number;
  onHpChange?: (hp: number) => void;
  attacks?: ReactNode;
  traits?: ReactNode;
}) {
  const maxHp = BASE_HP + physical.stats.reduce((sum, s) => sum + s.value, 0) + hpBonus;
  return (
    <ItemCard
      {...item}
      className={`sf-chassis-card${className ? ` ${className}` : ""}`}
      resistsInChips
      badges={<ItemResource kind="hp" max={maxHp} value={hp} onChange={onHpChange} />}
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
