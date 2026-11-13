import { useState, type ReactNode } from "react";
import { Popup } from "./popup.js";
import { Effect, Icon, Sign, StepHeader, title } from "./ui.js";
import { ChassisCard, ItemCard, TraitCard, traitCardKind } from "./cards.js";
import { content, itemById, traitById } from "../content.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { BASE_HP, type BuildSummary } from "../../engine/validate.js";
import { kitCostOf } from "../../engine/wealth.js";
import { CARRY_BASE, CARRY_PER_PHYSICAL, kg } from "../../engine/carry.js";

type Kit = BuildSummary["kit"];

// An item's Kit Cost as a chip, at creation: Basic for 0
const kitChip = (stock: StockItem | undefined) => (stock ? [kitCostOf(stock) ? `Kit Cost ${kitCostOf(stock)}` : "Basic"] : undefined);
import { ITEM_CATEGORIES, isCounted, stockItemNamed, withItem, withStock, type Item, type ItemCategory } from "../items.js";
import type { Item as StockItem } from "../../schema/index.js";
import { Button } from "./Button.js";
import { SheetTitle } from "./sheet-layout.js";

// Stock items to suggest while typing a name, money left out until wealth has rules.
// Natural weapons a Trait grants, like a Haymaker, come with the Trait rather
// than being picked up, so they aren't stock items. The universal ones every
// character has, Fists and Kick, are, for a player who wants them listed. A
// chassis's built-in weapons come with the chassis. Chassis are free for now,
// like every item, until wealth has rules.
const STOCK = content.items
  .filter((i) => i.category !== "currency" && !i.tags.includes("built-in") && (!i.tags.includes("natural weapon") || i.tags.includes("universal")))
  .sort((a, b) => a.name.localeCompare(b.name));

// A chassis's parts from content, for its card: its Physical stats, its
// built-in Attacks as item cards, the Traits it gives as Trait cards, and
// the HP those Traits add, like Reinforced's
function chassisParts(stock: StockItem) {
  const c = stock.chassis!;
  const traits = c.traits.flatMap((id) => traitById.get(id) ?? []);
  return {
    // Its full HP, as the engine works them out for an AI Core inhabiting it
    maxHp: BASE_HP + c.stats.endurance + c.stats.power + c.stats.grace + traits.reduce((n, t) => n + (t.resources.hp ?? 0), 0),
    // A chassis's stats are fixed: no slot past them is open
    physical: { core: c.core, stats: STAT_GROUPS.physical.map((s: StatId) => ({ id: s, value: c.stats[s as keyof typeof c.stats], bonus: 0, max: c.stats[s as keyof typeof c.stats] })) },
    hpBonus: traits.reduce((n, t) => n + (t.resources.hp ?? 0), 0),
    attacks: c.attacks.length
      ? c.attacks.flatMap((id) => {
          const a = itemById.get(id);
          return a ? [<ItemCard key={id} name={a.name} stock={a} category={a.category} />] : [];
        })
      : undefined,
    traits: traits.length
      ? traits.map((t) => (
          <TraitCard key={t.id} kind={traitCardKind(t)} name={t.name} plane={t.plane}>
            <Effect text={t.effect} />
          </TraitCard>
        ))
      : undefined,
  };
}

// Add item's picker, like the Traits step: a tab per category, each with a
// search, over the game's items as the inventory's item cards. A large
// checkbox at each card's right picks it, with a count to set; Add items
// adds every picked one, from any tab. The last tab, Custom, holds the form
// for an item the game doesn't have.
function ItemPicker({ onAdd, custom, kit }: { onAdd: (picked: { stock: StockItem; qty: number }[]) => void; custom: ReactNode; kit?: Kit }) {
  const categories = ITEM_CATEGORIES.filter((c) => STOCK.some((i) => i.category === c));
  const [tab, setTab] = useState<ItemCategory | "custom">(categories[0]!);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Map<string, number>>(new Map());
  // Cards opened to their badges and description
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) => {
    const next = new Set(opened);
    if (!next.delete(id)) next.add(id);
    setOpened(next);
  };
  const toggle = (id: string) => {
    const next = new Map(picked);
    if (!next.delete(id)) next.set(id, 1);
    setPicked(next);
  };
  const setCount = (id: string, n: number) => setPicked(new Map(picked).set(id, Math.max(1, n)));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (i: StockItem) => {
    const hay = [i.name, i.summary, i.type ?? "", ...(i.tags ?? [])].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const shown = STOCK.filter((i) => i.category === tab && matches(i));
  // How many cards the picks add: a consumable's bundles stack into one,
  // anything else is one card each
  const count = [...picked].reduce((n, [id, q]) => n + (isCounted(itemById.get(id)!) ? 1 : q), 0);
  // At creation, what the picks cost in Kit Points
  const cost = [...picked].reduce((n, [id, q]) => n + kitCostOf(itemById.get(id)!) * q, 0);
  return (
    <div className="item-picker sf-popup-grow">
      <div className="tech-fields tech-fields-light picker-box">
        <div className="tech-field-tab-list" role="tablist" aria-label="Item category">
          {categories.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={tab === c} className={`tech-field-tab${tab === c ? " is-active" : ""}`} onClick={() => setTab(c)}>
              {title(c)}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={tab === "custom"} className={`tech-field-tab${tab === "custom" ? " is-active" : ""}`} onClick={() => setTab("custom")}>
            Custom
          </button>
        </div>
        {tab === "custom" ? (
          <div className="item-picker-custom">
            <p className="hint">An item the game doesn't have yet: name it, say how many, and choose its category.</p>
            {custom}
          </div>
        ) : (
          <>
        <div className="filters">
          <input type="search" placeholder="Search name or tag" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search items" />
        </div>
        {shown.length === 0 && <p className="empty">No {title(tab).toLowerCase()} items match.</p>}
        <ul className="item-pick-list picker-scroll">
          {shown.map((i) => {
            const qty = picked.get(i.id);
            const selected = qty !== undefined;
            const open = opened.has(i.id);
            return (
              <li key={i.id} className={`item-pick-row${selected ? " selected" : ""}`}>
                {/* The inventory's item card (a chassis's, for a chassis), without Equip, which waits until the character has it */}
                <ItemOrChassisCard
                  className={`item-pick${kit && kitCostOf(i) > kit.ceiling && !(i.chassis && kitCostOf(i) <= 3) ? " is-over-kit" : ""}`}
                  name={i.name}
                  stock={i}
                  category={i.category}
                  chips={kit ? kitChip(i) : undefined}
                  count={selected ? (isCounted(i) ? qty * (i.bundle ?? 1) : qty) : undefined}
                  fold={{ open, onToggle: () => toggleOpen(i.id) }}
                >
                  {/* Picked, how many to add: bundles of a bundled item (its circle shows the units), else items */}
                  {selected && (
                    <div className="rank-step item-pick-count">
                      <span className="rank-label">{i.bundle ? `Bundles of ${i.bundle}` : "Count"}</span>
                      <Button round="xs" aria-label={`One fewer ${i.name}`} disabled={qty <= 1} onClick={() => setCount(i.id, qty - 1)}>
                        <Sign is="minus" />
                      </Button>
                      <span className="num">{qty}</span>
                      <Button round="xs" aria-label={`One more ${i.name}`} onClick={() => setCount(i.id, qty + 1)}>
                        <Sign is="plus" />
                      </Button>
                    </div>
                  )}
                </ItemOrChassisCard>
                {/* The large checkbox that picks it */}
                <input type="checkbox" className="item-pick-check" aria-label={`Add ${i.name}`} checked={selected} onChange={() => toggle(i.id)} />
              </li>
            );
          })}
        </ul>
          </>
        )}
      </div>
      {/* On the Custom tab, Add items only while something is picked, so it doesn't sit beside Add custom item */}
      {(tab !== "custom" || count > 0) && (
        <div className="sf-popup-foot">
          <Button
            tone={count === 0 ? "gray" : "primary"}
            ready={count > 0}
            className="build-button"
            disabled={count === 0}
            onClick={() => onAdd([...picked].map(([id, qty]) => ({ stock: itemById.get(id)!, qty })).filter((p) => p.stock))}
          >
            {count === 0 ? "Add items" : `Add ${count} ${count === 1 ? "item" : "items"}${kit && cost ? ` (${cost} Kit ${cost === 1 ? "Point" : "Points"})` : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
}

// The character's inventory, a column of the sheet after the Knowledges, in
// the Character Creator and on Player Tools' Tracker. A name the game's stock
// items know (content/items) adds that item, with its category, description
// and details; anything else is what the player writes.
// Money, by currency, as badges over the Items list, after Wealth: coins, the amount and the currency. The character's own currency
// always shows, even at 0; others once it holds any. Clicking one opens a
// field that takes a change ("+50", "-20") or a new total ("300"), applied
// with Enter or by leaving it; Escape puts it away. Money can't go below 0.
function CashBadges({ cash, currency, onChange }: { cash: Record<string, number>; currency: string; onChange: (currency: string, amount: number) => void }) {
  const [editing, setEditing] = useState<string>();
  const [text, setText] = useState("");
  const shown = [currency, ...Object.keys(cash).filter((c) => c !== currency && cash[c])];
  const apply = (c: string) => {
    const m = text.trim().replace(/[−–]/g, "-").match(/^([+-])?\s*(\d[\d,]*)$/);
    if (m) {
      const n = Number(m[2]!.replace(/,/g, ""));
      const now = cash[c] ?? 0;
      onChange(c, Math.max(0, m[1] === "+" ? now + n : m[1] === "-" ? now - n : n));
    }
    setEditing(undefined);
  };
  return (
    <span className="sf-cash">
      {shown.map((c) =>
        editing === c ? (
          <input
            key={c}
            type="text"
            inputMode="numeric"
            className="sf-cash-field"
            aria-label={`Change ${c}: +50, -20 or a new total`}
            placeholder={`+50, −20 or 300 ${c}`}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply(c);
              if (e.key === "Escape") setEditing(undefined);
            }}
            onBlur={() => apply(c)}
          />
        ) : (
          <button
            key={c}
            type="button"
            className="sf-cash-badge"
            title={`${c}: click to add, spend or set`}
            onClick={() => {
              setText("");
              setEditing(c);
            }}
          >
            <Icon name="coins" />
            <span className="sf-cash-amount">{(cash[c] ?? 0).toLocaleString("en-US")}</span> {c}
          </button>
        ),
      )}
    </span>
  );
}

// The equipped items' weight against the carry weight, as a badge in the
// cash badges' style, before Wealth: "12.5 / 40 kg", red once the character
// is Encumbered. Its title says what the carry weight comes from and the
// Condition the load gives.
function CarryBadge({ load, limit, state }: { load: number; limit: number; state: string }) {
  const condition = traitById.get(state)?.name ?? state;
  const details = `Equipped items weigh ${kg(load)} kg of a ${limit} kg carry weight (${CARRY_BASE} kg + ${CARRY_PER_PHYSICAL} kg per Physical): ${condition}`;
  const over = state === "encumbered" || state === "heavily-encumbered";
  return (
    <span className={`sf-cash-badge sf-carry-badge${over ? " is-over" : ""}`} title={details} aria-label={details}>
      <span className="sf-cash-amount">{kg(load)}</span>/{limit} kg
    </span>
  );
}

// Wealth as a badge in the cash badges' style, before them: the rating, and
// at creation (`kit`) the Kit Points left of what it gives, red once the
// items cost too much. Its title says the rest: the dearest Kit Cost allowed,
// the cash the points left become in play, and any free chassis.
function WealthBadge({ wealth, kit }: { wealth: number; kit?: Kit }) {
  const sign = wealth > 0 ? `+${wealth}` : `${wealth}`;
  const over = kit && kit.spent > kit.budget;
  const details = kit
    ? [
        `Wealth ${sign}: ${kit.budget} Kit Points for starting items, each up to Kit Cost ${kit.ceiling}`,
        `${kit.budget - kit.spent} left`,
        ...(kit.left > 0 ? [`the rest becomes ${kit.cash.amount.toLocaleString("en-US")} ${kit.cash.currency} in play`] : []),
        ...(kit.freeChassis ? [`${itemById.get(kit.freeChassis)?.name ?? "a chassis"} free`] : []),
      ].join("; ")
    : `Wealth ${sign}`;
  return (
    <span className={`sf-cash-badge sf-wealth-badge${over ? " is-over" : ""}`} title={details} aria-label={details}>
      <span className="sf-cash-amount">{sign}</span> Wealth
      {kit && (
        <span className="sf-wealth-kit">
          {" "}
          · <span className="sf-cash-amount">{kit.budget - kit.spent}</span>/{kit.budget} Kit
        </span>
      )}
    </span>
  );
}

// An item's card, or for a chassis its ChassisCard: the same top line and
// options, holding its Physical stats, Attacks and Traits. `hp` is a
// chassis's HP, kept on the character's item; a picker's card keeps its own.
function ItemOrChassisCard({ hp, ...props }: Parameters<typeof ItemCard>[0] & { hp?: { value?: number; onChange: (hp: number | undefined) => void } }) {
  if (!props.stock?.chassis) return <ItemCard {...props} />;
  const { body: _body, badges: _badges, resistsInChips: _r, ...item } = props;
  const { maxHp, ...parts } = chassisParts(props.stock);
  // At full, the item stores no HP, so a chassis that gains HP stays full
  const onHpChange = hp ? (v: number) => hp.onChange(v === maxHp ? undefined : v) : undefined;
  return <ChassisCard {...item} {...parts} hp={hp?.value} onHpChange={onHpChange} />;
}

// The character's inventory. An AI Core inhabits the one chassis it has
// equipped: equipping another moves it there. Each chassis keeps its own HP
// on the item, so it remembers its damage while the AI Core is in another;
// the inhabited one's are the character's HP (Player Tools' tracker).
//
// At creation (`kit`, from the check), each stock item shows its Kit Cost,
// and the Wealth badge by the title says how many Kit Points are left of
// what Wealth gives (WealthBadge).
//
// Money is a badge by the title (CashBadges), not an item: `cash`, in
// `currency` first (the Origin's), changed with `onCash`.
export function Items({
  items,
  onChange,
  kit,
  cash,
  currency = "ERC",
  onCash,
  wealth,
  carry,
}: {
  items: Item[];
  onChange: (items: Item[]) => void;
  // The equipped items' weight (load) against the carry weight (limit), in
  // kg, and the encumbrance Condition that sets
  carry?: { load: number; limit: number; state: string };
  kit?: Kit;
  cash?: Record<string, number>;
  currency?: string;
  onCash?: (cash: Record<string, number>) => void;
  wealth?: number;
}) {
  // Add item's popup: the game's items to pick from, or a custom item the
  // player names and sorts
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [category, setCategory] = useState<ItemCategory>("gear");
  // Add item's popup, open or not
  const [adding, setAdding] = useState(false);
  // Items whose notes field the player opened or closed with the note
  // button; the rest show it only when they have notes.
  const [notesShown, setNotesShown] = useState<Map<string, boolean>>(new Map());
  const showsNotes = (item: Item) => notesShown.get(item.id) ?? Boolean(item.notes);
  const toggleNotes = (item: Item) => setNotesShown(new Map(notesShown).set(item.id, !showsNotes(item)));
  const [focusNote, setFocusNote] = useState<string>();
  // Items opened to their full card, with their other badges, description
  // and Note under the same top line; the rest show the top line alone
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Open cards showing the fields to edit them, from their Edit button.
  // Closing a card puts its fields away too.
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const toggleExpanded = (item: Item) => {
    const next = new Set(expanded);
    if (!next.delete(item.id)) next.add(item.id);
    else if (editing.has(item.id)) {
      const edits = new Set(editing);
      edits.delete(item.id);
      setEditing(edits);
    }
    setExpanded(next);
  };
  const toggleEditing = (item: Item) => {
    const next = new Set(editing);
    if (!next.delete(item.id)) next.add(item.id);
    setEditing(next);
  };

  const update = (item: Item, change: Partial<Item>) => onChange(items.map((i) => (i === item ? { ...i, ...change } : i)));
  const isChassis = (i: Item) => Boolean(i.item && itemById.get(i.item)?.chassis);
  // Equipping a chassis moves the AI Core into it, out of any other
  const equip = (item: Item, equipped: boolean) =>
    onChange(items.map((i) => (i === item ? { ...i, equipped } : equipped && isChassis(item) && isChassis(i) ? { ...i, equipped: false } : i)));
  const remove = (item: Item) => onChange(items.filter((i) => i !== item));
  const countOf = (n: string) => Math.max(1, Math.round(Number(n)) || 1);
  // The items checked in the picker, as the game describes them: a
  // consumable's count is in bundles (2 of Arrows is 40 arrows), anything
  // else's in separate items
  const addStock = (picked: { stock: StockItem; qty: number }[]) => {
    onChange(picked.reduce((list, { stock, qty: n }) => withStock(list, stock, n), items));
    setAdding(false);
  };
  // A custom item: whatever the player writes, unless the name is a stock
  // item's, which adds that item
  const addCustom = () => {
    if (!name.trim()) return;
    const stock = stockItemNamed(content.items, name);
    const count = countOf(qty);
    onChange(stock ? withStock(items, stock, count) : withItem(items, { name: name.trim(), qty: count, category, equipped: false }));
    setName("");
    setQty("1");
    setAdding(false);
  };

  return (
    <section className="tools-items">
      {/* Add item at the right end of the title's line, opening the add form in a popup */}
      <SheetTitle
        as="h4"
        icon="backpack"
        aside={
          <Button size="small" tone="item" className="sf-sheet-add" aria-label="Add item" onClick={() => setAdding(true)}>
            Add<span className="sf-sheet-add-noun"> item</span>
          </Button>
        }
      >
        Items
      </SheetTitle>

      {/* The carried weight, Wealth and money on a line of their own over
          the list, so the title's line keeps room on small screens */}
      {(carry || wealth !== undefined || onCash) && (
        <div className="sf-items-money">
          {carry && <CarryBadge {...carry} />}
          {wealth !== undefined && <WealthBadge wealth={wealth} kit={kit} />}
          {onCash && <CashBadges cash={cash ?? {}} currency={currency} onChange={(c, n) => onCash({ ...cash, [c]: n })} />}
        </div>
      )}

      {adding && (
        <Popup label="Add items" onClose={() => setAdding(false)} size="wide" scroll="inner" className="sheet-add-popup item-picker-popup">
          <StepHeader title="Add items" />
          {/* Most items come from the game's list: search, check, set counts */}
          <ItemPicker
            kit={kit}
            onAdd={addStock}
            custom={
              <form
                className="tools-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addCustom();
                }}
              >
                <input type="text" placeholder="Item name" aria-label="Custom item name" className="tools-add-name" value={name} onChange={(e) => setName(e.target.value)} />
                <input type="number" min={1} aria-label="Custom item count" className="tools-qty" value={qty} onChange={(e) => setQty(e.target.value)} />
                <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as ItemCategory)}>
                  {ITEM_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {title(c)}
                    </option>
                  ))}
                </select>
                <Button type="submit" disabled={!name.trim()}>
                  Add custom item
                </Button>
              </form>
            }
          />
        </Popup>
      )}

      {items.length === 0 ? (
        <p className="sf-sheet-empty">No Items yet.</p>
      ) : (
        <ul className="tools-item-list sf-sheet-cards sf-sheet-scroll sf-sheet-scroll--short">
          {items.map((item) => {
            const stock = item.item ? itemById.get(item.item) : undefined;
            return (
              <ItemOrChassisCard
                key={item.id}
                as="li"
                name={item.name}
                stock={stock}
                category={item.category}
                count={isCounted(item) ? item.qty : undefined}
                hp={isChassis(item) ? { value: item.hp, onChange: (hp) => update(item, { hp }) } : undefined}
                chips={kit ? (item.item === kit.freeChassis ? ["Free chassis"] : kitChip(stock)) : undefined}
                equip={{ checked: item.equipped, onChange: (equipped) => equip(item, equipped) }}
                fold={{ open: expanded.has(item.id), onToggle: () => toggleExpanded(item) }}
                edit={{
                  editing: editing.has(item.id),
                  onToggle: () => toggleEditing(item),
                  onRemove: () => remove(item),
                  // A counted item's count at the left, then the name. The category stays as the item has it.
                  fields: (
                    <>
                      {isCounted(item) && (
                        <input
                          type="number"
                          min={0}
                          className="tools-qty"
                          aria-label={`How many ${item.name}`}
                          value={item.qty}
                          onChange={(e) => update(item, { qty: Math.max(0, Math.round(Number(e.target.value)) || 0) })}
                        />
                      )}
                      <input type="text" className="sf-item-name-field" aria-label="Item name" value={item.name} onChange={(e) => update(item, { name: e.target.value })} />
                    </>
                  ),
                }}
                note={{
                  shown: showsNotes(item),
                  onToggle: () => {
                    if (!showsNotes(item)) setFocusNote(item.id);
                    toggleNotes(item);
                  },
                  field: (
                    <input
                      type="text"
                      className="tools-note"
                      placeholder="Notes, like damage, resistances or charges"
                      aria-label={`${item.name} notes`}
                      // Opened with the note button, it takes the focus
                      autoFocus={focusNote === item.id}
                      value={item.notes ?? ""}
                      onChange={(e) => update(item, { notes: e.target.value || undefined })}
                    />
                  ),
                }}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
