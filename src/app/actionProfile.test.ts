import { describe, expect, it } from "vitest";
import { parseActionProfile } from "./actionProfile.js";

describe("parseActionProfile", () => {
  it("reads a spell's temporary weapon into its parts", () => {
    const p = parseActionProfile(
      "This character may spend 2 MP to Attack a target with a temporary weapon that has the following profile: (Ranged) (max range 30 m) (2 Blunt per Rank, 4 Heat per Rank) (Attack Stat: Magic) (area of effect: 3 m per Rank). Characters and Items damaged by Cast Fireball gain the Burning Condition.",
    )!;
    expect(p.before).toBe("This character may spend 2 MP to Attack a target with a temporary weapon:");
    expect(p.attackType).toBe("Ranged");
    expect(p.maxRange).toBe("30 m");
    expect(p.damage).toEqual([
      { type: "Blunt", amount: 2, perRank: true },
      { type: "Heat", amount: 4, perRank: true },
    ]);
    expect(p.attackStat).toBe("Magic");
    expect(p.areaOfEffect).toEqual({ amount: 3, unit: "m", perRank: true });
    expect(p.after).toBe("Characters and Items damaged by Cast Fireball gain the Burning Condition.");
  });

  it("leaves an Action without a profile alone", () => {
    expect(parseActionProfile("This character may spend 1 MP to give the Shielded Condition to a character within 3 m.")).toBeUndefined();
  });

  it("keeps parts it can't read", () => {
    expect(parseActionProfile("Attack with a weapon that has the following profile: (Ranged) (2 Glitter per Rank).")!.other).toEqual(["2 Glitter per Rank"]);
  });
});
