import { useId, useState } from "react";
import { title } from "./ui.js";
import { content, itemById } from "../content.js";
import { ITEM_CATEGORIES, itemDetails, stockItemNamed, withItem, type Item, type ItemCategory } from "../items.js";

// Stock items to suggest while typing a name, money left out until wealth has rules.
const STOCK = content.items.filter((i) => i.category !== "currency").sort((a, b) => a.name.localeCompare(b.name));

// The character's inventory, a column of the sheet after the Knowledges, in
// the Character Creator and on Player Tools' Tracker. A name the game's stock
// items know (content/items) adds that item, with its category, description
// and details; anything else is what the player writes.
export function Items({ items, onChange }: { items: Item[]; onChange: (items: Item[]) => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [category, setCategory] = useState<ItemCategory>("gear");
  const listId = useId();

  const update = (item: Item, change: Partial<Item>) => onChange(items.map((i) => (i === item ? { ...i, ...change } : i)));
  const remove = (item: Item) => onChange(items.filter((i) => i !== item));
  const add = () => {
    if (!name.trim()) return;
    const stock = stockItemNamed(content.items, name);
    const count = Math.max(1, Math.round(Number(qty)) || 1);
    onChange(
      withItem(
        items,
        stock
          ? {
              item: stock.id,
              name: stock.name,
              qty: count,
              category: stock.category,
              equipped: false,
            }
          : { name: name.trim(), qty: count, category, equipped: false },
      ),
    );
    setName("");
    setQty("1");
  };

  return (
    <section className="tools-items">
      <h4 className="rule">Items</h4>

      <form
        className="tools-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          placeholder="Item name"
          aria-label="Item name"
          list={listId}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            const stock = stockItemNamed(content.items, e.target.value);
            if (stock) setCategory(stock.category);
          }}
        />
        <datalist id={listId}>
          {STOCK.map((i) => (
            <option key={i.id} value={i.name} />
          ))}
        </datalist>
        <input type="number" min={1} aria-label="Count" className="tools-qty" value={qty} onChange={(e) => setQty(e.target.value)} />
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as ItemCategory)}>
          {ITEM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {title(c)}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>

      {items.length === 0 ? (
        <p className="empty">No items yet.</p>
      ) : (
        <ul className="tools-item-list">
          {items.map((item) => {
            const stock = item.item ? itemById.get(item.item) : undefined;
            const details = stock ? itemDetails(stock) : "";
            return (
              <li key={item.id} className="c-sheet-box tools-item">
                <div className="tools-item-row">
                  <input
                    type="text"
                    className="tools-item-name"
                    aria-label="Item name"
                    value={item.name}
                    onChange={(e) => update(item, { name: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0}
                    className="tools-qty"
                    aria-label={`How many ${item.name}`}
                    value={item.qty}
                    onChange={(e) =>
                      update(item, {
                        qty: Math.max(0, Math.round(Number(e.target.value)) || 0),
                      })
                    }
                  />
                  <select
                    aria-label={`${item.name} category`}
                    value={item.category}
                    onChange={(e) => update(item, { category: e.target.value as ItemCategory })}
                  >
                    {ITEM_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {title(c)}
                      </option>
                    ))}
                  </select>
                  <label className="tools-equipped">
                    <input type="checkbox" checked={item.equipped} onChange={(e) => update(item, { equipped: e.target.checked })} /> Equipped
                  </label>
                  <button type="button" className="link" onClick={() => remove(item)}>
                    Remove
                  </button>
                </div>
                {stock && (
                  <p className="tools-item-stock">
                    {stock.summary}
                    {details && <span className="tools-item-details"> {details}</span>}
                  </p>
                )}
                <input
                  type="text"
                  className="tools-note"
                  placeholder="Notes, like damage, resistances or charges"
                  aria-label={`${item.name} notes`}
                  value={item.notes ?? ""}
                  onChange={(e) => update(item, { notes: e.target.value || undefined })}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
