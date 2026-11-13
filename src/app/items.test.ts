import { describe, expect, it } from "vitest";
import { itemById } from "./content.js";
import { readItems, withItem, withoutItem, withStock, type Item } from "./items.js";

const arrows = itemById.get("arrows")!;
const dagger = itemById.get("dagger")!;
const names = (items: Item[]) => items.map((i) => `${i.qty} ${i.name}`);

describe("counted and one-of-a-kind items", () => {
  it("adds a consumable by the bundle, stacking it in units", () => {
    let items = withStock([], arrows, 1);
    items = withStock(items, arrows, 2);
    expect(items).toMatchObject([{ item: "arrows", name: "Arrows", qty: 60, units: true }]);
  });

  it("adds anything else as separate items of one each", () => {
    const items = withStock(withStock([], dagger, 2), dagger, 1);
    expect(names(items)).toEqual(["1 Dagger", "1 Dagger", "1 Dagger"]);
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
  });

  it("adds a written-in consumable in units, a written-in tool one per item", () => {
    let items = withItem([], { name: "Candle", qty: 3, category: "consumable", equipped: false });
    items = withItem(items, { name: "candle", qty: 2, category: "consumable", equipped: false });
    items = withItem(items, { name: "Lantern", qty: 2, category: "gear", equipped: false });
    expect(names(items)).toEqual(["5 Candle", "1 Lantern", "1 Lantern"]);
  });

  it("removes some of a counted item, or that many of an item by name", () => {
    const items = withStock(withStock([], arrows, 1), dagger, 3);
    expect(names(withoutItem(items, "Arrows", 5))).toEqual(["15 Arrows", "1 Dagger", "1 Dagger", "1 Dagger"]);
    expect(names(withoutItem(items, "dagger", 2))).toEqual(["20 Arrows", "1 Dagger"]);
    expect(names(withoutItem(items, "Dagger"))).toEqual(["20 Arrows"]);
  });

  it("reads a save from before counting: bundles become units, several of one item become that many", () => {
    const items = readItems([
      { item: "arrows", name: "Arrows", qty: 2, category: "consumable" },
      { item: "dagger", name: "Dagger", qty: 2, category: "weapon", equipped: true, notes: "Dad's" },
      { name: "Bread", qty: 4, category: "consumable" },
    ]);
    expect(items).toMatchObject([
      { name: "Arrows", qty: 40, units: true },
      { name: "Dagger", qty: 1, equipped: true, notes: "Dad's" },
      { name: "Dagger", qty: 1, equipped: false, notes: "Dad's" },
      { name: "Bread", qty: 4, units: true },
    ]);
  });

  it("reads a save since counting as it is", () => {
    const once = readItems([{ item: "arrows", name: "Arrows", qty: 13, category: "consumable", units: true }]);
    expect(once).toMatchObject([{ qty: 13, units: true }]);
    expect(readItems(JSON.parse(JSON.stringify(once)))).toMatchObject([{ qty: 13, units: true }]);
  });
});
