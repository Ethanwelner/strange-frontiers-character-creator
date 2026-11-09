import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import type { Trait } from "../../schema/index.js";
import { SettingIcon } from "./ui.js";

// The card components. Every card of a kind comes from one of these, so a new
// card can't drift from the others:
//
//   TraitCard       Knowledges, Languages, Skills, Abilities and spells,
//                   Conditions, Circumstances and Other Traits
//   ItemCard        Weapons, wearables, equipment and natural weapons
//   BackgroundCard  Kinds, Origins, Professions and Pasts
//
// These cards, the creator's and Player Tools', are the reference for every
// Strange Frontiers card. The site draws the same markup from
// php/rpg/components/cards.php (sf_card_trait, sf_card_item,
// sf_card_background), and its css/sf-cards.css should match the card rules
// in src/app/styles.css. Until one shared file exists, a change to a card's
// markup or styles here goes to the site too.
//
// The creator's own states ride on the shared markup as extra classes:
// .selected and .rejected on a picker's card, .is-open on an Ability that
// keeps its effect in view while closed.

// The kind of Trait card, which sets its category chip and, for a Condition,
// its gray bar
export type TraitCardKind = "knowledge" | "language" | "skill" | "ability" | "condition" | "circumstance" | "other";

// A Trait's card kind from its category: a Language is a Knowledge with the
// language type, Contacts and Memberships are Circumstances, and starters
// fall under Other.
export function traitCardKind(t: Pick<Trait, "category" | "types"> | undefined): TraitCardKind {
  if (!t) return "other";
  if (t.category === "knowledge") return t.types.includes("language") ? "language" : "knowledge";
  if (t.category === "contact" || t.category === "membership") return "circumstance";
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

// The chevron of a card that folds, pointing up while it's open
export function CardChevron() {
  return (
    <svg className="sf-card-chevron" viewBox="0 0 12 8" aria-hidden="true" focusable="false">
      <path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// A card's note: where a Trait came from, how long a Condition lasts, what
// a Trait needs
export function CardNote({ children }: { children: ReactNode }) {
  return <p className="sf-card-note">{children}</p>;
}

type Fold = {
  open: boolean;
  onToggle: () => void;
  // Shown whether the card is open or not, before the rest of its body: an
  // Ability's effect. A card with it opens from a chevron button instead of
  // a <details>, since a closed <details> hides all of its body.
  always?: ReactNode;
  // The chevron's label, like "Shield Wall"
  label: string;
};

/**
 * A Trait card: the name bar (the setting's mark, the name, its Rank, then
 * `chips` at the right), then the body (`children`).
 *
 * `fold` makes it open from a chevron in the bar, closed to the bar alone.
 * `as` and `rootProps` let a picker draw it as a list item it can check.
 */
export function TraitCard({
  kind,
  name,
  rank,
  plane,
  chips,
  fold,
  className = "",
  as: Root = "div",
  rootProps,
  barActions,
  children,
}: {
  kind: TraitCardKind;
  name: ReactNode;
  rank?: number;
  plane?: string;
  chips?: ReactNode;
  fold?: Fold;
  className?: string;
  as?: "div" | "li";
  rootProps?: HTMLAttributes<HTMLElement> & Record<`aria-${string}`, unknown>;
  // Buttons at the bar's right, outside the chips, like a Condition's ✕
  barActions?: ReactNode;
  children?: ReactNode;
}) {
  const classes = `sf-card sf-trait-card sf-trait-card--${kind}${cardRegionClass(plane)}${className ? ` ${className}` : ""}`;
  const label = (
    <span className="sf-card-name">
      <SettingIcon plane={plane} />
      {name}
      {rank !== undefined ? ` (${rank})` : ""}
    </span>
  );

  // Folding with a <details>: the whole bar opens and closes it
  if (fold && fold.always === undefined) {
    return (
      <details
        className={classes}
        open={fold.open}
        onToggle={(e) => {
          if (e.currentTarget.open !== fold.open) fold.onToggle();
        }}
      >
        <summary className="sf-card-bar" aria-label={`${fold.open ? "Collapse" : "Expand"} ${fold.label}`}>
          {label}
          <span className="sf-card-chips">
            {chips}
            <CardChevron />
          </span>
        </summary>
        <div className="sf-card-body">{children}</div>
      </details>
    );
  }

  const chevron = fold && (
    <button
      type="button"
      className="sf-card-fold"
      aria-label={`${fold.open ? "Collapse" : "Expand"} ${fold.label}`}
      aria-expanded={fold.open}
      title={fold.open ? "Collapse" : "Expand"}
      onClick={fold.onToggle}
    >
      <CardChevron />
    </button>
  );
  const hasChips = chips !== undefined && chips !== null && chips !== false;
  return (
    <Root className={`${classes}${fold?.open ? " is-open" : ""}`} {...rootProps}>
      <div className="sf-card-bar">
        {label}
        {(hasChips || chevron || barActions) && (
          <span className="sf-card-chips">
            {chips}
            {chevron}
            {barActions}
          </span>
        )}
      </div>
      <div className="sf-card-body">
        {fold?.always}
        {(!fold || fold.open) && children}
      </div>
    </Root>
  );
}

/**
 * An Item card: its top line (`row`: the name and its badges, with whatever
 * the inventory adds around them), then the rest of the card (`children`).
 * `edge` holds what sits on the card's edges, like the inventory's count.
 */
export function ItemCard({
  className = "",
  as: Root = "div",
  edge,
  row,
  children,
}: {
  className?: string;
  as?: "div" | "li";
  edge?: ReactNode;
  row: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Root className={`equipment-box sf-item-card${className ? ` ${className}` : ""}`}>
      {edge}
      <div className="equipment-row sf-item-summary">{row}</div>
      {children}
    </Root>
  );
}

// An Item's name, on its card's top line
export const ItemName = ({ children }: { children: ReactNode }) => <span className="equipment-name">{children}</span>;

// What a Background card gives, as labeled rows of chips: Bonus, Grants,
// Choose, Background list, or a Kind's Grants
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
 * With `select` it's a card to pick in a radio group, clickable and
 * keyboard-operable, ringed in green while picked (.selected).
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
