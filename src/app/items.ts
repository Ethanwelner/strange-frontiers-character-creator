// What a character carries, shared by the Character Creator's sheet and
// Player Tools: a name, a count, a rough category and notes. A stock item from
// content/items also names its id (`item`); anything else is what the player
// writes. It travels in the build as `items` (BuildItem in engine/build.ts).
import { ITEM_CATEGORIES } from "../engine/build.js";
import type { Item as StockItem } from "../schema/index.js";

export { ITEM_CATEGORIES };
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export interface Item {
  id: string;
  // The stock item's id, for an item from content/items.
  item?: string;
  name: string;
  qty: number;
  category: ItemCategory;
  equipped: boolean;
  notes?: string;
}

export const newId = () => Math.random().toString(36).slice(2, 10);

// Items with the same name stack.
export function withItem(items: Item[], item: Omit<Item, "id">): Item[] {
  const same = items.find((i) => i.name.toLowerCase() === item.name.toLowerCase());
  if (same) return items.map((i) => (i === same ? { ...i, qty: i.qty + item.qty } : i));
  return [...items, { ...item, id: newId() }];
}

// Removes `qty` of an item, or all of it if `qty` is missing or covers it.
export function withoutItem(items: Item[], name: string, qty?: number): Item[] {
  const item = items.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (!item) return items;
  if (qty === undefined || qty >= item.qty) return items.filter((i) => i !== item);
  return items.map((i) => (i === item ? { ...i, qty: i.qty - qty } : i));
}

// Items as a build file or a save holds them, each with an id and its
// fields filled in. Anything that isn't an item with a name is dropped.
export function readItems(input: unknown): Item[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw): Item[] => {
    if (typeof raw !== "object" || raw === null) return [];
    const i = raw as Record<string, unknown>;
    if (typeof i.name !== "string" || !i.name.trim()) return [];
    const category = (ITEM_CATEGORIES as readonly unknown[]).includes(i.category) ? (i.category as ItemCategory) : "gear";
    return [
      {
        id: typeof i.id === "string" && i.id ? i.id : newId(),
        ...(typeof i.item === "string" && i.item ? { item: i.item } : {}),
        name: i.name,
        qty: typeof i.qty === "number" && i.qty >= 0 ? Math.round(i.qty) : 1,
        category,
        equipped: i.equipped === true,
        ...(typeof i.notes === "string" && i.notes ? { notes: i.notes } : {}),
      },
    ];
  });
}

// A stock item's rules in a line, like "Piercing, Slashing damage; 60 ERC".
export function itemDetails(stock: StockItem): string {
  const line = [
    stock.damageTypes.length ? `${stock.damageTypes.join(", ")} damage` : "",
    stock.resistances ? `resists ${stock.resistances}` : "",
    stock.uses ?? "",
    stock.slot ? `${stock.slot} slot` : "",
    stock.value !== undefined && stock.currency ? `${stock.value.toLocaleString("en-US")} ${stock.currency}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

// The stock item with this name, if there is one, so a written-in "dagger"
// becomes the Dagger.
export function stockItemNamed(stock: StockItem[], name: string): StockItem | undefined {
  const n = name.trim().toLowerCase();
  return stock.find((s) => s.name.toLowerCase() === n);
}
