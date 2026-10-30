// What a character carries, shared by the Character Creator's sheet and
// Player Tools. Item rules aren't settled yet, so an item is what the player
// writes: a name, a count, a rough category and notes. It travels in the
// build as `items` (BuildItem in engine/build.ts).
import { ITEM_CATEGORIES } from "../engine/build.js";

export { ITEM_CATEGORIES };
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export interface Item {
  id: string;
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
        name: i.name,
        qty: typeof i.qty === "number" && i.qty >= 0 ? Math.round(i.qty) : 1,
        category,
        equipped: i.equipped === true,
        ...(typeof i.notes === "string" && i.notes ? { notes: i.notes } : {}),
      },
    ];
  });
}
