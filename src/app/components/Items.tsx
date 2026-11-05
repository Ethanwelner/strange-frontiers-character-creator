import { Fragment, useId, useState } from "react";
import { Chip, Icon, LorePopup, title } from "./ui.js";
import { damageIcon } from "./Resistances.js";
import { content, itemById } from "../content.js";
import { ITEM_CATEGORIES, itemUses, stockItemNamed, withItem, type Item, type ItemCategory } from "../items.js";
import { parseDamage } from "../../engine/damage.js";
import { parseResistances } from "../resistances.js";
import type { Item as StockItem } from "../../schema/index.js";

// Stock items to suggest while typing a name, money left out until wealth has rules.
const STOCK = content.items.filter((i) => i.category !== "currency").sort((a, b) => a.name.localeCompare(b.name));

// A stock item's damage and resistances as badges, in a closed card's line
// before its category, and under an open card's fields. Each badge starts
// with a circle on its left edge: a bow for a ranged or thrown weapon's
// damage, a sword for any other's, a shield for resistances. Then each damage
// type's icon and number, all in one badge, with "or" between a damage
// choice's options. Where a resistance applies, like a helmet's (head), is
// left to the item's description.
function ItemStats({ stock }: { stock: StockItem }) {
  const damage = stock.damage ? parseDamage(stock.damage) : undefined;
  const resists = stock.resistances ? parseResistances(stock.resistances, stock.name) : [];
  if (!stock.damage && !resists.length) return null;
  const ranged = stock.tags?.some((t) => t === "ranged" || t === "thrown");
  const damageLead = (
    <span className="tools-item-stat-lead">
      <Icon name={ranged ? "bow-arrow" : "sword"} label={ranged ? "Ranged damage" : "Melee damage"} />
    </span>
  );
  return (
    <div className="tools-item-stats">
      {stock.damage && (
        <span className="tools-item-stat-group">
          {damage ? (
            <span className="chip tools-item-stat">
              {damageLead}
              {damage.map((option, i) => (
                <Fragment key={i}>
                  {i > 0 && <span className="tools-item-stat-or">or</span>}
                  {option.map((d) => (
                    <span key={d.type} className="tools-item-stat-value">
                      <Icon name={damageIcon(d.type)} label={d.type} />
                      {d.amount}
                    </span>
                  ))}
                </Fragment>
              ))}
            </span>
          ) : (
            // Damage the badges can't read stays as written
            <span className="chip tools-item-stat">
              {damageLead}
              {stock.damage}
            </span>
          )}
        </span>
      )}
      {resists.length > 0 && (
        <span className="tools-item-stat-group">
          <span className="chip tools-item-stat">
            <span className="tools-item-stat-lead">
              <Icon name="shield" label="Resists" />
            </span>
            {resists.map((r, i) => (
              <span key={i} className="tools-item-stat-value">
                <Icon name={damageIcon(r.type)} label={r.type} />
                {r.amount}
              </span>
            ))}
          </span>
        </span>
      )}
    </div>
  );
}

// The character's inventory, a column of the sheet after the Knowledges, in
// the Character Creator and on Player Tools' Tracker. A name the game's stock
// items know (content/items) adds that item, with its category, description
// and details; anything else is what the player writes.
export function Items({ items, onChange }: { items: Item[]; onChange: (items: Item[]) => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [category, setCategory] = useState<ItemCategory>("gear");
  // Add item's popup, open or not
  const [adding, setAdding] = useState(false);
  const listId = useId();
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
        <LorePopup label="Add an item" onClose={() => setAdding(false)} className="sheet-add-popup">
          <h3 className="subhead">Add an item</h3>
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
        </LorePopup>
      )}

      {items.length === 0 ? (
        <p className="empty">No Items yet.</p>
      ) : (
        <ul className="tools-item-list">
          {items.map((item) => {
            const stock = item.item ? itemById.get(item.item) : undefined;
            const details = stock ? itemUses(stock) : "";
            const open = expanded.has(item.id);
            // The chevron that opens the card to its fields, or closes it back to a line
            const expand = (
              <button
                type="button"
                className="tools-item-icon tools-item-expand"
                aria-label={`${open ? "Collapse" : "Expand"} ${item.name}`}
                aria-expanded={open}
                title={open ? "Collapse" : "Expand"}
                onClick={() => toggleExpanded(item)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8" aria-hidden="true">
                  <path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            );
            // How many, in a circle on the card's left edge, open or closed
            const count = (
              <span className="tools-item-count" aria-label={`${item.qty} of ${item.name}`}>
                {item.qty}
              </span>
            );
            // Equip, a checkbox at the start of the card's first line, open or closed
            const equip = (
              <label className="tools-equipped" title="Equip">
                <input type="checkbox" aria-label="Equip" checked={item.equipped} onChange={(e) => update(item, { equipped: e.target.checked })} />
                <span className="tools-equipped-label">Equip</span>
              </label>
            );
            const edit = editing.has(item.id);
            // The top line, the same open or closed: Equip, the name, then its
            // damage, resistances and category at the right, and the chevron
            const topLine = (
              <div className="tools-item-row tools-item-summary">
                {equip}
                <span className="tools-item-title">{item.name}</span>
                {stock && <ItemStats stock={stock} />}
                {/* The category as a badge, like a Trait card's */}
                <span className="tools-item-category">
                  <Chip>{title(item.category)}</Chip>
                </span>
                {expand}
              </div>
            );
            if (!open) {
              return (
                <li key={item.id} className="c-sheet-box tools-item">
                  {count}
                  {topLine}
                </li>
              );
            }
            const cost = stock?.value !== undefined && stock.currency ? `${stock.value.toLocaleString("en-US")} ${stock.currency}` : undefined;
            return (
              <li key={item.id} className="c-sheet-box tools-item">
                {count}
                {topLine}
                {/* Edit, a pen in a circle on the card's right edge, centered
                    top to bottom, like the count on the left */}
                <button
                  type="button"
                  className="tools-item-edge tools-item-edit-toggle"
                  aria-label={`Edit ${item.name}`}
                  title="Edit"
                  aria-expanded={edit}
                  onClick={() => toggleEditing(item)}
                >
                  <span className="pen-icon" aria-hidden="true" />
                </button>
                {/* In edit mode, Remove, a trash can in a circle under Edit's */}
                {edit && (
                  <button type="button" className="tools-item-edge tools-item-remove" aria-label={`Remove ${item.name}`} title="Remove" onClick={() => remove(item)}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true">
                      <path d="M135.2 17.69C140.6 6.848 151.7 0 163.8 0H284.2C296.3 0 307.4 6.848 312.8 17.69L320 32H416C433.7 32 448 46.33 448 64C448 81.67 433.7 96 416 96H32C14.33 96 0 81.67 0 64C0 46.33 14.33 32 32 32H128L135.2 17.69zM394.8 466.1C393.2 492.3 372.3 512 346.9 512H101.1C75.75 512 54.77 492.3 53.19 466.1L31.1 128H416L394.8 466.1z" />
                    </svg>
                  </button>
                )}
                {/* Under the top line, the badges it leaves out: the cost, and
                    later keywords and the like */}
                {cost && (
                  <div className="tools-item-badges">
                    <Chip>{cost}</Chip>
                  </div>
                )}
                {/* Edit's fields where the top line shows them: how many at the left, then
                    the name and the category */}
                {edit && (
                  <div className="tools-item-row tools-item-fields">
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
                    <input
                      type="text"
                      className="tools-item-name"
                      aria-label="Item name"
                      value={item.name}
                      onChange={(e) => update(item, { name: e.target.value })}
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
                  </div>
                )}
                {stock && (
                  <div className="tools-item-stock">
                    {/* The flavor text, then the rules on their own line under it */}
                    <p className="tools-item-flavor">{stock.summary}</p>
                    {details && <p className="tools-item-details">{details}</p>}
                  </div>
                )}
                <div className="tools-item-note-line">
                  {/* Note, a pen and its label, opening the notes field at its right */}
                  <button
                    type="button"
                    className="tools-item-note-toggle"
                    aria-expanded={showsNotes(item)}
                    onClick={() => {
                      if (!showsNotes(item)) setFocusNote(item.id);
                      toggleNotes(item);
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" aria-hidden="true">
                        <path d="M492.7 58.75C517.7 83.74 517.7 124.3 492.7 149.3L444.3 197.7L314.3 67.72L362.7 19.32C387.7-5.678 428.3-5.678 453.3 19.32L492.7 58.75zM58.57 323.5L291.7 90.34L421.7 220.3L188.5 453.4C178.1 463.8 165.2 471.5 151.1 475.6L30.77 511C22.35 513.5 13.24 511.2 7.03 504.1C.8198 498.8-1.502 489.7 .976 481.2L36.37 360.9C40.53 346.8 48.16 333.9 58.57 323.5L58.57 323.5zM552 464C565.3 464 576 474.7 576 488C576 501.3 565.3 512 552 512H248C234.7 512 224 501.3 224 488C224 474.7 234.7 464 248 464H552z" />
                    </svg>
                    Note
                  </button>
                  {showsNotes(item) && (
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
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
