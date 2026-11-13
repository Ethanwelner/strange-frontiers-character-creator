// What a character carries, shared by the Character Creator's sheet and
// Player Tools: a name, a count, a rough category and notes. A stock item from
// content/items also names its id (`item`); anything else is what the player
// writes. It travels in the build as `items` (BuildItem in engine/build.ts).
//
// Consumables are counted, in single units: 20 Arrows, 3 Healing Potions.
// Stock ones come in bundles (a quiver of 20 Arrows), so adding one adds a
// bundle. Everything else is one of a kind: two Daggers are two items, each
// equipped and noted on its own.
import { ITEM_CATEGORIES, isCounted } from "../engine/build.js";
import type { Item as StockItem } from "../schema/index.js";
import { attackText, damageText } from "../engine/damage.js";
import { itemLoad } from "../engine/carry.js";
import { itemById } from "./content.js";

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
  // A counted item whose count is in single units (20 Arrows), as every one
  // saved since bundles is. Saves from before counted bundles (1 quiver), so
  // reading one without this multiplies its count by the bundle.
  units?: true;
}

export const newId = () => Math.random().toString(36).slice(2, 10);

export { isCounted };

// How many of a stock item come in one bundle: Arrows 20, most things 1.
export const bundleOf = (id: string | undefined) => (id ? itemById.get(id)?.bundle : undefined) ?? 1;

// Adds an item. A counted one stacks with any of the same name, its `qty` in
// units; anything else comes as `qty` separate items of one each.
export function withItem(items: Item[], item: Omit<Item, "id">): Item[] {
  if (isCounted(item)) {
    const same = items.find((i) => i.name.toLowerCase() === item.name.toLowerCase());
    if (same) return items.map((i) => (i === same ? { ...i, qty: i.qty + item.qty, units: true } : i));
    return [...items, { ...item, id: newId(), units: true }];
  }
  const { units: _units, ...one } = item;
  return [...items, ...Array.from({ length: item.qty }, () => ({ ...one, qty: 1, id: newId() }))];
}

// The same, with `bundles` of a stock item: 2 of Arrows adds 40.
export function withStock(items: Item[], stock: StockItem, bundles: number): Item[] {
  const counted = isCounted(stock);
  return withItem(items, { item: stock.id, name: stock.name, qty: counted ? bundles * (stock.bundle ?? 1) : bundles, category: stock.category, equipped: false });
}

// Removes `qty` of a counted item, or that many of the items with that name;
// all of them if `qty` is missing or covers them.
export function withoutItem(items: Item[], name: string, qty?: number): Item[] {
  const named = (i: Item) => i.name.toLowerCase() === name.toLowerCase();
  const item = items.find(named);
  if (!item) return items;
  if (!isCounted(item)) {
    let left = qty ?? Infinity;
    return items.filter((i) => !(named(i) && left-- > 0));
  }
  if (qty === undefined || qty >= item.qty) return items.filter((i) => i !== item);
  return items.map((i) => (i === item ? { ...i, qty: i.qty - qty } : i));
}

// What the equipped items weigh, in kg (engine/carry.ts): the load against
// the carry weight
export const carriedLoad = (items: Item[]) => items.reduce((n, i) => n + itemLoad(i, i.item ? itemById.get(i.item) : undefined), 0);

// A counted item's count with its name, "20 Arrows"; anything else, its name.
export const itemLabel = (item: Pick<Item, "name" | "qty" | "category">) => (isCounted(item) ? `${item.qty} ${item.name}` : item.name);

// Items as a build file or a save holds them, each with an id and its
// fields filled in. Anything that isn't an item with a name is dropped.
// Saves from before counting change on the way in: a counted item's count
// of bundles becomes units (1 Arrows becomes 20), and several of an item
// that isn't counted become that many items, the first keeping its Equip.
export function readItems(input: unknown): Item[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw): Item[] => {
    if (typeof raw !== "object" || raw === null) return [];
    const i = raw as Record<string, unknown>;
    if (typeof i.name !== "string" || !i.name.trim()) return [];
    const category = (ITEM_CATEGORIES as readonly unknown[]).includes(i.category) ? (i.category as ItemCategory) : "gear";
    const stockId = typeof i.item === "string" && i.item ? i.item : undefined;
    const qty = typeof i.qty === "number" && i.qty >= 0 ? Math.round(i.qty) : 1;
    const item: Item = {
      id: typeof i.id === "string" && i.id ? i.id : newId(),
      ...(stockId ? { item: stockId } : {}),
      name: i.name,
      qty,
      category,
      equipped: i.equipped === true,
      ...(typeof i.notes === "string" && i.notes ? { notes: i.notes } : {}),
      ...(typeof i.hp === "number" && Number.isFinite(i.hp) ? { hp: Math.round(i.hp) } : {}),
    };
    // Money (old saves kept it as items) keeps its count, to move into cash
    if (category === "currency") return [item];
    if (isCounted(item)) return [{ ...item, qty: i.units === true ? qty : qty * bundleOf(stockId), units: true }];
    return Array.from({ length: Math.max(1, qty) }, (_, n) => (n === 0 ? { ...item, qty: 1 } : { ...item, id: newId(), qty: 1, equipped: false }));
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
    stock.value !== undefined && stock.currency ? `${stock.value.toLocaleString("en-US")} ${stock.currency}${stock.bundle ? ` per ${stock.bundle}` : ""}` : "",
    weightText(stock),
  ]
    .filter(Boolean)
    .join("; ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

// A stock item's weight, like "1.5 kg" or for a bundle "1.5 kg per 20"
export const weightText = (stock: StockItem) => (stock.weight !== undefined ? `${stock.weight} kg${stock.bundle ? ` per ${stock.bundle}` : ""}` : "");

// A stock item's rules that read as badges, under an open card's top line:
// its cost and weight, how it Attacks, and the slot it takes, like "60 ERC",
// "0.5 kg", "Melee Attack", "Max Range: 1 m", "Grace" (the Attack Stat),
// "Slot: Headwear".
export function itemBadges(stock: StockItem): string[] {
  return [
    stock.value !== undefined && stock.currency ? `${stock.value.toLocaleString("en-US")} ${stock.currency}${stock.bundle ? ` per ${stock.bundle}` : ""}` : "",
    weightText(stock),
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
