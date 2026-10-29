import { useState } from "react";
import { title } from "../../app/components/ui.js";
import { addItem, ITEM_CATEGORIES, type Item, type ItemCategory, type Play } from "../play.js";

// The character's inventory. Item rules aren't settled yet, so an item is
// what the player writes: a name, a count, a rough category and notes.
export function Items({ play, onChange }: { play: Play; onChange: (p: Play) => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [category, setCategory] = useState<ItemCategory>("gear");

  const update = (item: Item, change: Partial<Item>) => onChange({ ...play, items: play.items.map((i) => (i === item ? { ...i, ...change } : i)) });
  const remove = (item: Item) => onChange({ ...play, items: play.items.filter((i) => i !== item) });
  const add = () => {
    if (!name.trim()) return;
    onChange(addItem(play, { name: name.trim(), qty: Math.max(1, Math.round(Number(qty)) || 1), category, equipped: false }));
    setName("");
    setQty("1");
  };

  return (
    <section className="tools-items">
      <header className="step-head">
        <h2>Items</h2>
        <p className="lede">What the character carries. Items with the same name stack.</p>
      </header>

      <form
        className="tools-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input type="text" placeholder="Item name" aria-label="Item name" value={name} onChange={(e) => setName(e.target.value)} />
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

      {play.items.length === 0 ? (
        <p className="empty">No items yet.</p>
      ) : (
        <ul className="tools-item-list">
          {play.items.map((item) => (
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
                  onChange={(e) => update(item, { qty: Math.max(0, Math.round(Number(e.target.value)) || 0) })}
                />
                <select aria-label={`${item.name} category`} value={item.category} onChange={(e) => update(item, { category: e.target.value as ItemCategory })}>
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
              <input
                type="text"
                className="tools-note"
                placeholder="Notes, like damage, resistances or charges"
                aria-label={`${item.name} notes`}
                value={item.notes ?? ""}
                onChange={(e) => update(item, { notes: e.target.value || undefined })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
