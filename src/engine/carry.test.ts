import { describe, expect, it } from "vitest";
import { carryOf, carryWeight, encumbrance, itemLoad, movementUnder } from "./carry.js";

describe("carry weight and encumbrance", () => {
  it("carries 20 kg plus 10 kg per Physical", () => {
    expect(carryWeight(0)).toBe(20);
    expect(carryWeight(2)).toBe(40);
    expect(carryWeight(-1)).toBe(20);
  });

  it("steps through the four Conditions at half, all and double the carry weight", () => {
    expect(encumbrance(0, 40)).toBe("unencumbered");
    expect(encumbrance(20, 40)).toBe("unencumbered");
    expect(encumbrance(20.1, 40)).toBe("lightly-encumbered");
    expect(encumbrance(40, 40)).toBe("lightly-encumbered");
    expect(encumbrance(40.1, 40)).toBe("encumbered");
    expect(encumbrance(80, 40)).toBe("encumbered");
    expect(encumbrance(80.1, 40)).toBe("heavily-encumbered");
  });

  it("weighs only equipped items, a counted one by its share of the bundle", () => {
    expect(itemLoad({ qty: 1, equipped: true, category: "armor" }, { weight: 25 })).toBe(25);
    expect(itemLoad({ qty: 1, equipped: false, category: "armor" }, { weight: 25 })).toBe(0);
    expect(itemLoad({ qty: 10, equipped: true, category: "consumable" }, { weight: 1.5, bundle: 20 })).toBe(0.75);
    expect(itemLoad({ qty: 2, equipped: true, category: "consumable" }, { weight: 0.3 })).toBeCloseTo(0.6);
    expect(itemLoad({ qty: 1, equipped: true, category: "gear" })).toBe(0);
  });

  it("halves Movement when Encumbered and stops it when Heavily Encumbered", () => {
    expect(movementUnder("10 m", "lightly-encumbered")).toBe("10 m");
    expect(movementUnder("10 m", "encumbered")).toBe("5 m");
    expect(movementUnder("15 m", "encumbered")).toBe("7.5 m");
    expect(movementUnder("10 m", "heavily-encumbered")).toBe("0 m");
    expect(movementUnder("-", "encumbered")).toBe("-");
  });
});

describe("Traits and items that change carry weight", () => {
  const vest = { qty: 1, equipped: true, category: "armor", stock: { weight: 10 } };
  const shield = { qty: 1, equipped: true, category: "armor", stock: { weight: 8, tags: ["shield"] } };
  const sword = { qty: 1, equipped: true, category: "weapon", stock: { weight: 4 } };
  const rope = { qty: 1, equipped: true, category: "gear", stock: { weight: 3 } };
  const all = [vest, shield, sword, rope];

  it("counts everything equipped without Traits", () => {
    expect(carryOf(2, all)).toMatchObject({ load: 25, limit: 40, state: "lightly-encumbered" });
  });

  it("halves armor at Armor Training 1 and drops it at 2, but not shields", () => {
    expect(carryOf(2, all, [{ trait: "armor-training", rank: 1 }]).load).toBe(20);
    expect(carryOf(2, all, [{ trait: "armor-training", rank: 2 }]).load).toBe(15);
  });

  it("stacks Arms Bearer, Shield Bearer and Pack Mule", () => {
    const c = carryOf(2, all, [
      { trait: "arms-bearer", rank: 1 },
      { trait: "shield-bearer", rank: 1 },
      { trait: "armor-training", rank: 2 },
      { trait: "pack-mule", rank: 2 },
    ]);
    expect(c).toMatchObject({ load: 3, limit: 60, state: "unencumbered" });
  });

  it("adds carry bonuses, skips items that carry themselves and holds Gear in a holder", () => {
    const exo = { qty: 1, equipped: true, category: "gear", stock: { weight: 25, carryBonus: 30, carriesItself: true } };
    const satchel = { qty: 1, equipped: true, category: "gear", stock: { weight: 1, holdsItems: 1 } };
    const c = carryOf(2, [...all, exo, satchel]);
    // the satchel holds the rope (3 kg), the exoframe carries itself
    expect(c).toMatchObject({ load: 23, limit: 70 });
  });

  it("lets Beast of Burden move at a quarter when Heavily Encumbered", () => {
    expect(carryOf(0, [{ ...rope, stock: { weight: 50 } }], [{ trait: "beast-of-burden", rank: 1 }]).beastOfBurden).toBe(true);
    expect(movementUnder("10 m", "heavily-encumbered", true)).toBe("2.5 m");
  });
});
