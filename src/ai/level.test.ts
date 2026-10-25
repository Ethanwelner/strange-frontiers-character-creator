import { describe, expect, it } from "vitest";
import { levelFromDescription } from "./level.js";

describe("levelFromDescription", () => {
  it("reads a level the player asks for", () => {
    expect(levelFromDescription("A level 5 Isek scout")).toBe(5);
    expect(levelFromDescription("a 5th-level goblin mage")).toBe(5);
    expect(levelFromDescription("Make her level five")).toBe(5);
    expect(levelFromDescription("an 8th level guard")).toBe(8);
    expect(levelFromDescription("lvl 12 pilot")).toBe(12);
    expect(levelFromDescription("a third level hedge witch")).toBe(3);
    expect(levelFromDescription("Level-2 truck pilot")).toBe(2);
    // Up to level 25
    expect(levelFromDescription("a level 25 archmage")).toBe(25);
    expect(levelFromDescription("level twenty-five")).toBe(25);
    expect(levelFromDescription("level twenty two")).toBe(22);
    expect(levelFromDescription("a twenty-first level warlord")).toBe(21);
    expect(levelFromDescription("level twenty")).toBe(20);
  });

  it("leaves the campaign's level alone when none is asked for", () => {
    expect(levelFromDescription("A goblin who failed out of the mage schools")).toBeUndefined();
    expect(levelFromDescription("She levels with people and has 5 brothers")).toBeUndefined();
    expect(levelFromDescription("a level 40 demigod")).toBeUndefined();
    expect(levelFromDescription("a level 26 demigod")).toBeUndefined();
    expect(levelFromDescription("ground level of the Ark")).toBeUndefined();
  });
});
