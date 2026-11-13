import { describe, expect, it } from "vitest";
import { carryWeight, encumbrance, itemLoad, movementUnder } from "./carry.js";

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
