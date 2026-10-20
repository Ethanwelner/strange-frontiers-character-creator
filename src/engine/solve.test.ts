import { describe, expect, it } from "vitest";
import { loadContent } from "./content.js";
import { allocateLevels, solveConcept, type ConceptInput, type Solution } from "./solve.js";
import { validateBuild } from "./validate.js";

const { content } = loadContent();
const isek = content.kinds.find((k) => k.id === "isek")!.stats!;

const solve = (concept: ConceptInput, level = 1) => {
  const out = solveConcept(concept, content, { startingLevel: level });
  if ("error" in out) throw new Error(out.error);
  return out as Solution;
};

const hunter: ConceptInput = {
  kind: "isek",
  origin: "illinsdott",
  profession: "guild-hunter",
  past: "noble-household",
  focus: ["grace", "power"],
  traits: ["survivalist", "vigilance", "fireball", "monsters-of-isekai", "streetwise", "haggler"],
};

describe("allocateLevels", () => {
  it("puts each level's points into the focus stats in turn", () => {
    expect(allocateLevels(["grace", "power"], isek, 1)).toEqual([{ group: "physical", points: { grace: 2, power: 1 } }]);
  });

  it("rotates levels through the focus stats' groups, in focus order", () => {
    const levels = allocateLevels(["grace", "intuition"], isek, 3);
    expect(levels.map((l) => l.group)).toEqual(["physical", "mental", "physical"]);
    expect(levels[1]!.points).toEqual({ intuition: 3 });
  });

  it("moves points to the group's other stats when a focus stat is at its max", () => {
    const capped = { ...isek, grace: { start: 18, max: 18 } };
    expect(allocateLevels(["grace"], capped, 1)).toEqual([{ group: "physical", points: { power: 2, endurance: 1 } }]);
  });

  it("still allocates every level with no focus", () => {
    const levels = allocateLevels([], isek, 2);
    expect(levels).toHaveLength(2);
    for (const l of levels) expect(Object.values(l.points).reduce((a, b) => a + (b ?? 0), 0)).toBe(3);
  });
});

describe("solveConcept", () => {
  it("builds a legal character from the concept, buying Traits in order", () => {
    const s = solve(hunter);
    expect(s.result.ok).toBe(true);
    expect(validateBuild(s.build, content).ok).toBe(true);
    expect(s.taken).toEqual(["survivalist", "vigilance", "streetwise", "haggler"]);
    expect(s.skipped).toEqual([
      { trait: "fireball", reason: 'Trait "fireball" doesn\'t exist' },
      { trait: "monsters-of-isekai", reason: "already held (from profession guild-hunter)" },
    ]);
    expect(s.build.traits.slice(0, 4).map((t) => t.trait)).toEqual(s.taken);
  });

  it("spends leftover background picks on the Background Trait list", () => {
    const s = solve(hunter);
    const list = s.result.summary!.backgroundList;
    expect(list.length).toBeGreaterThan(0);
    expect(s.filled.length).toBeGreaterThan(0);
    for (const id of s.filled) {
      expect(list).toContain(id);
      expect(s.build.traits).toContainEqual({ trait: id, rank: 1, pick: "background" });
    }
  });

  it("buys a second rank when a ranked Trait is listed twice", () => {
    const s = solve({ ...hunter, traits: ["seafaring", "seafaring"] });
    expect(s.build.traits.filter((t) => t.trait === "seafaring").map((t) => t.rank)).toEqual([1, 2]);
  });

  it("buys the next rank of a ranked Trait a package already grants", () => {
    const s = solve({ ...hunter, traits: ["farming"] });
    expect(s.build.traits.filter((t) => t.trait === "farming").map((t) => t.rank)).toEqual([2]);
  });

  it("stops buying when the picks run out", () => {
    const many = content.traits.filter((t) => !t.background).map((t) => t.id);
    const s = solve({ ...hunter, traits: many });
    expect(s.result.ok).toBe(true);
    expect(s.result.summary!.picks.universal.banked).toBe(0);
    expect(s.skipped.some((x) => x.reason === "no picks left")).toBe(true);
  });

  it("answers choices it can check, and keeps a valid answer from the concept", () => {
    const s = solve({ ...hunter, origin: "port-herminst", past: "merchant-dynasty", choices: [{ package: "merchant-dynasty", from: "language", traits: ["english"] }] });
    expect(s.build.choices).toEqual([
      { package: "port-herminst", from: "dreftian-language", traits: ["dreftan"] },
      { package: "merchant-dynasty", from: "language", traits: ["english"] },
    ]);
    expect(s.result.ok).toBe(true);
  });

  it("leaves Contacts for the player", () => {
    const s = solve({ ...hunter, profession: "caravaneer", choices: [{ package: "caravaneer", from: "contact", traits: ["Old Mott"] }] });
    expect(s.build.choices).toEqual([]);
    expect(s.result.ok).toBe(true);
  });

  it("answers a bought Trait's language choice, and leaves its Contact for the player", () => {
    const s = solve({ ...hunter, traits: ["additional-language", "additional-contact", ...hunter.traits!] });
    expect(s.taken.slice(0, 2)).toEqual(["additional-language", "additional-contact"]);
    const answer = s.build.choices.find((c) => c.trait === "additional-language");
    // The first language in the pool the build doesn't hold yet.
    expect(answer).toEqual({ trait: "additional-language", from: "language", traits: ["dreftan"] });
    expect(s.build.choices.some((c) => c.trait === "additional-contact")).toBe(false);
    expect(s.result.ok).toBe(true);
    expect(s.result.warnings.map((w) => w.message)).toContain("Additional Contact gives 1 Contact: record who on the Choices step");
  });

  it("keeps the concept's answer to a Trait's choice, and skips languages the build holds", () => {
    // Port Herminst gives Dreftan, so English is the only language left.
    const held = solve({ ...hunter, origin: "port-herminst", traits: ["additional-language"] });
    expect(held.build.choices.find((c) => c.trait === "additional-language")!.traits).toEqual(["english"]);
    const s = solve({
      ...hunter,
      traits: ["additional-language"],
      choices: [{ trait: "additional-language", from: "language", traits: ["english"] }],
    });
    expect(s.build.choices.find((c) => c.trait === "additional-language")!.traits).toEqual(["english"]);
    expect(s.result.ok).toBe(true);
  });

  it("buys nothing when the Kind or a package is wrong", () => {
    const s = solve({ ...hunter, kind: "dragon" });
    expect(s.result.ok).toBe(false);
    expect(s.build.traits).toEqual([]);
    expect(s.result.errors.map((e) => e.code)).toContain("kind");
  });

  it("reports a concept that doesn't match the format", () => {
    expect(solveConcept({ kind: "isek" }, content)).toEqual({ error: expect.stringContaining("origin") });
  });
});
