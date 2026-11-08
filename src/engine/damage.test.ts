import { describe, expect, it } from "vitest";
import { attackText, damageText, parseDamage } from "./damage.js";

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

  it("reads Corrosive, and a type without an amount", () => {
    expect(parseDamage("3 Corrosive")).toEqual([[{ type: "Corrosive", amount: 3 }]]);
    expect(parseDamage("Heat")).toEqual([[{ type: "Heat" }]]);
    // A natural weapon adds a Stat
    expect(parseDamage("1 Blunt + Power")).toEqual([[{ type: "Blunt", amount: 1, plus: "Power" }]]);
  });

  it("rejects what isn't amounts and damage types", () => {
    expect(parseDamage("5 Fire")).toBeUndefined();
    expect(parseDamage("lots")).toBeUndefined();
    expect(parseDamage("1 Blunt + Luck")).toBeUndefined();
  });

  it("writes the damage out for the sheet", () => {
    expect(damageText("5 Slashing / 4 Piercing")).toBe("5 Slashing or 4 Piercing");
    expect(damageText("3 Slashing, 3 Piercing")).toBe("3 Slashing and 3 Piercing");
    expect(damageText("2 Blunt, 6 Heat / 7 EMP")).toBe("2 Blunt and 6 Heat or 7 EMP");
    expect(damageText("lots")).toBe("lots");
    expect(damageText("3 Blunt + Power")).toBe("3 Blunt + Power");
  });
});

describe("attackText", () => {
  it("lists how a weapon Attacks", () => {
    expect(attackText({ attackType: "Melee", maxRange: "2 m", attackStat: "Grace / Power" })).toBe("Melee Attack; Max Range: 2 m; Attack Stat: Grace / Power");
    expect(attackText({ attackType: "Ranged, Thrown", attackStat: "Grace", areaOfEffect: "5 m" })).toBe("Ranged, Thrown Attack; Attack Stat: Grace; Area of Effect: 5 m");
    expect(attackText({ attackType: "Ranged", maxRange: "100 m", attackStat: "Grace", reload: "Full" })).toBe("Ranged Attack; Max Range: 100 m; Attack Stat: Grace; Reload: Full Action");
    expect(attackText({})).toBe("");
  });
});
