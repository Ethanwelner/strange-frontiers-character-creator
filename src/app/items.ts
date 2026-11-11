// What a character carries, shared by the Character Creator's sheet and
// Player Tools: a name, a count, a rough category and notes. A stock item from
// content/items also names its id (`item`); anything else is what the player
// writes. It travels in the build as `items` (BuildItem in engine/build.ts).
import { ITEM_CATEGORIES } from "../engine/build.js";
import type { Item as StockItem } from "../schema/index.js";
import { attackText, damageText } from "../engine/damage.js";

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
  // A chassis's HP now, kept with it so it remembers its damage while the
  // AI Core is in another. Missing means full.
  hp?: number;
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
        ...(typeof i.hp === "number" && Number.isFinite(i.hp) ? { hp: Math.round(i.hp) } : {}),
      },
    ];
  });
}

// A stock item's rules in a line, like "3 Slashing or 4 Piercing damage; 120 ERC".
export function itemDetails(stock: StockItem): string {
  const line = [
    stock.damage ? `${damageText(stock.damage)} damage` : "",
    attackText(stock),
    stock.resistances ? `resists ${stock.resistances}` : "",
    stock.modifiers ?? "",
    stock.uses ?? "",
    stock.slot ? `Slot: ${stock.slot}` : "",
    stock.value !== undefined && stock.currency ? `${stock.value.toLocaleString("en-US")} ${stock.currency}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

// A stock item's rules that read as badges, under an open card's top line:
// its cost, how it Attacks, and the slot it takes, like "60 ERC",
// "Melee Attack", "Max Range: 1 m", "Grace" (the Attack Stat), "Slot: Headwear".
export function itemBadges(stock: StockItem): string[] {
  return [
    stock.value !== undefined && stock.currency ? `${stock.value.toLocaleString("en-US")} ${stock.currency}` : "",
    stock.attackType ? `${stock.attackType} Attack` : "",
    stock.maxRange ? `Max Range: ${stock.maxRange}` : "",
    stock.attackStat ? stock.attackStat : "",
    stock.areaOfEffect ? `Area of Effect: ${stock.areaOfEffect}` : "",
    stock.reload ? `Reload: ${stock.reload} Action` : "",
    stock.slot ? `Slot: ${stock.slot}` : "",
  ].filter(Boolean);
}

// What the badges leave out, as a rules line under the description: its
// Defense and other modifiers, its uses, and what a hit does, like
// "Defense +2 (when Defending)" or "Uses 1: when thrown".
export function itemUses(stock: StockItem): string {
  const line = [stock.modifiers ?? "", stock.uses ?? "", stock.onHit ? `On Hit: ${stock.onHit}` : ""].filter(Boolean).join("; ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

// The stock item with this name, if there is one, so a written-in "dagger"
// becomes the Dagger.
export function stockItemNamed(stock: StockItem[], name: string): StockItem | undefined {
  const n = name.trim().toLowerCase();
  return stock.find((s) => s.name.toLowerCase() === n);
}
