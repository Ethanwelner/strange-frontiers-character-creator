import { useState, type ReactNode } from "react";
import { LorePopup, Sign, title } from "./ui.js";
import { ItemCard } from "./cards.js";
import { content, itemById } from "../content.js";
import { ITEM_CATEGORIES, stockItemNamed, withItem, type Item, type ItemCategory } from "../items.js";
import type { Item as StockItem } from "../../schema/index.js";

// Stock items to suggest while typing a name, money left out until wealth has rules.
// Natural weapons a Trait grants, like a Haymaker, come with the Trait rather
// than being picked up, so they aren't stock items. The universal ones every
// character has, Fists and Kick, are, for a player who wants them listed.
const STOCK = content.items
  .filter((i) => i.category !== "currency" && (!i.tags.includes("natural weapon") || i.tags.includes("universal")))
  .sort((a, b) => a.name.localeCompare(b.name));

// Add item's picker, like the Traits step: a tab per category, each with a
// search, over the game's items as the inventory's item cards. A large
// checkbox at each card's right picks it, with a count to set; Add items
// adds every picked one, from any tab. The last tab, Custom, holds the form
// for an item the game doesn't have.
function ItemPicker({ onAdd, custom }: { onAdd: (picked: { stock: StockItem; qty: number }[]) => void; custom: ReactNode }) {
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
  const count = [...picked.values()].reduce((n, q) => n + q, 0);
  return (
    <div className="item-picker">
      <div className="tech-fields tech-fields-light">
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
        <ul className="item-pick-list">
          {shown.map((i) => {
            const qty = picked.get(i.id);
            const selected = qty !== undefined;
            const open = opened.has(i.id);
            return (
              <li key={i.id} className={`item-pick-row${selected ? " selected" : ""}`}>
                {/* The inventory's item card, without Equip, which waits until the character has it */}
                <ItemCard
                  className="item-pick"
                  name={i.name}
                  stock={i}
                  category={i.category}
                  count={selected ? qty : undefined}
                  fold={{ open, onToggle: () => toggleOpen(i.id) }}
                >
                  {/* Picked, how many to add */}
                  {selected && (
                    <div className="rank-step item-pick-count">
                      <span className="rank-label">Count</span>
                      <button type="button" aria-label={`One fewer ${i.name}`} disabled={qty <= 1} onClick={() => setCount(i.id, qty - 1)}>
                        <Sign is="minus" />
                      </button>
                      <span className="num">{qty}</span>
                      <button type="button" aria-label={`One more ${i.name}`} onClick={() => setCount(i.id, qty + 1)}>
                        <Sign is="plus" />
                      </button>
                    </div>
                  )}
                </ItemCard>
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
        <div className="item-picker-submit">
          <button
            type="button"
            className="build-button"
            disabled={count === 0}
            onClick={() => onAdd([...picked].map(([id, qty]) => ({ stock: itemById.get(id)!, qty })).filter((p) => p.stock))}
          >
            {count === 0 ? "Add items" : `Add ${count} ${count === 1 ? "item" : "items"}`}
          </button>
        </div>
      )}
    </div>
  );
}

// The character's inventory, a column of the sheet after the Knowledges, in
// the Character Creator and on Player Tools' Tracker. A name the game's stock
// items know (content/items) adds that item, with its category, description
// and details; anything else is what the player writes.
export function Items({ items, onChange }: { items: Item[]; onChange: (items: Item[]) => void }) {
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
  const remove = (item: Item) => onChange(items.filter((i) => i !== item));
  const countOf = (n: string) => Math.max(1, Math.round(Number(n)) || 1);
  // The items checked in the picker, as the game describes them
  const addStock = (picked: { stock: StockItem; qty: number }[]) => {
    onChange(
      picked.reduce(
        (list, { stock, qty: n }) => withItem(list, { item: stock.id, name: stock.name, qty: n, category: stock.category, equipped: false }),
        items,
      ),
    );
    setAdding(false);
  };
  // A custom item: whatever the player writes, unless the name is a stock
  // item's, which adds that item
  const addCustom = () => {
    if (!name.trim()) return;
    const stock = stockItemNamed(content.items, name);
    const count = countOf(qty);
    onChange(
      withItem(
        items,
        stock
          ? { item: stock.id, name: stock.name, qty: count, category: stock.category, equipped: false }
          : { name: name.trim(), qty: count, category, equipped: false },
      ),
    );
    setName("");
    setQty("1");
    setAdding(false);
  };

  return (
    <section className="tools-items">
      {/* Add item at the right end of the title's line, opening the add form in a popup */}
      <div className="sheet-section-head">
        <h4 className="rule">Items</h4>
        <button type="button" className="sheet-section-add" aria-label="Add item" onClick={() => setAdding(true)}>
          Add<span className="sheet-section-add-noun"> item</span>
        </button>
      </div>

      {adding && (
        <LorePopup label="Add items" onClose={() => setAdding(false)} className="sheet-add-popup item-picker-popup">
          <h3 className="subhead">Add items</h3>
          {/* Most items come from the game's list: search, check, set counts */}
          <ItemPicker
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
                <button type="submit" disabled={!name.trim()}>
                  Add custom item
                </button>
              </form>
            }
          />
        </LorePopup>
      )}

      {items.length === 0 ? (
        <p className="empty">No Items yet.</p>
      ) : (
        <ul className="tools-item-list">
          {items.map((item) => {
            const stock = item.item ? itemById.get(item.item) : undefined;
            return (
              <ItemCard
                key={item.id}
                as="li"
                name={item.name}
                stock={stock}
                category={item.category}
                count={item.qty}
                equip={{ checked: item.equipped, onChange: (equipped) => update(item, { equipped }) }}
                fold={{ open: expanded.has(item.id), onToggle: () => toggleExpanded(item) }}
                edit={{
                  editing: editing.has(item.id),
                  onToggle: () => toggleEditing(item),
                  onRemove: () => remove(item),
                  // How many at the left, then the name. The category stays as the item has it.
                  fields: (
                    <>
                      <input
                        type="number"
                        min={0}
                        className="tools-qty"
                        aria-label={`How many ${item.name}`}
                        value={item.qty}
                        onChange={(e) => update(item, { qty: Math.max(0, Math.round(Number(e.target.value)) || 0) })}
                      />
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
