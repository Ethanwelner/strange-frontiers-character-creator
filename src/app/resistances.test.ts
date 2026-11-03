import { describe, expect, it } from "vitest";
import { loadContent } from "../engine/content.js";
import { parseResistances, resistancesOf, traitResistances } from "./resistances.js";

const { content } = loadContent();
const total = (rs: { type: string; amount: number; where?: string }[], type: string) =>
  rs.filter((r) => r.type === type && !r.where).reduce((n, r) => n + r.amount, 0);

describe("resistances", () => {
  it("reads an item's list, with a note at the end covering all of it", () => {
    expect(parseResistances("1 Blunt, 3 Slashing, 1 Piercing", "Chainmail").map((r) => [r.type, r.amount, r.where])).toEqual([
      ["Blunt", 1, undefined],
      ["Slashing", 3, undefined],
      ["Piercing", 1, undefined],
    ]);
    expect(parseResistances("4 Blunt, 3 Slashing (when raised)", "Shield").every((r) => r.where === "when raised")).toBe(true);
    const suit = parseResistances("2 Blunt (decompression), 4 Cold", "Voidsuit");
    expect(suit.map((r) => r.where)).toEqual(["decompression", undefined]);
    expect(parseResistances("3 Acidic/Corrosive", "Suit")[0]?.type).toBe("Acidic/Corrosive");
  });

  it("reads a Trait's Rank *3 at the rank held", () => {
    const stone = traitResistances("This character gains Rank *3 resistance to all Physical damage types.", 2, "Stone Skin");
    expect(stone.map((r) => [r.type, r.amount])).toEqual([
      ["Blunt", 6],
      ["Slashing", 6],
      ["Piercing", 6],
    ]);
    const shell = traitResistances(
      "Rank *3 added to this character's Blunt, Slashing, and Piercing resistances for attacks that hit its torso.",
      1,
      "Hard Shell",
    );
    expect(shell.every((r) => r.where === "torso" && r.amount === 3)).toBe(true);
  });

  it("adds up equipped items and held Conditions, not carried ones", () => {
    const item = (name: string, equipped: boolean) => ({ id: name, name, qty: 1, category: "armor" as const, equipped });
    const rs = resistancesOf(content, [item("Chainmail", true), item("Gambeson", false)], [{ trait: "stone-skin", rank: 1 }]);
    expect(total(rs, "Slashing")).toBe(3 + 3);
    expect(total(rs, "Cold")).toBe(0);
  });
});
