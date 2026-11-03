import { describe, expect, it } from "vitest";
import { damageText, parseDamage } from "./damage.js";

describe("weapon damage", () => {
  it("reads commas as damage dealt together and a slash as a choice", () => {
    expect(parseDamage("2 Blunt, 2 Electrical")).toEqual([
      [
        { type: "Blunt", amount: 2 },
        { type: "Electrical", amount: 2 },
      ],
    ]);
    expect(parseDamage("5 Slashing / 4 Piercing")).toEqual([[{ type: "Slashing", amount: 5 }], [{ type: "Piercing", amount: 4 }]]);
    expect(parseDamage("5 Blunt/4 Piercing")).toHaveLength(2);
  });

  it("keeps Acidic/Corrosive as one type, and a type without an amount", () => {
    expect(parseDamage("3 Acidic/Corrosive")).toEqual([[{ type: "Acidic/Corrosive", amount: 3 }]]);
    expect(parseDamage("Heat")).toEqual([[{ type: "Heat" }]]);
  });

  it("rejects what isn't amounts and damage types", () => {
    expect(parseDamage("5 Fire")).toBeUndefined();
    expect(parseDamage("lots")).toBeUndefined();
  });

  it("writes the damage out for the sheet", () => {
    expect(damageText("5 Slashing / 4 Piercing")).toBe("5 Slashing or 4 Piercing");
    expect(damageText("3 Slashing, 3 Piercing")).toBe("3 Slashing and 3 Piercing");
    expect(damageText("2 Blunt, 6 Heat / 7 EMP")).toBe("2 Blunt and 6 Heat or 7 EMP");
    expect(damageText("lots")).toBe("lots");
  });
});
