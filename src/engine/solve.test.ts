import { describe, expect, it } from "vitest";
import { loadContent } from "./content.js";
import { allocateLevels, Concept, rankFocus, solveConcept, type ConceptInput, type Solution } from "./solve.js";
import { validateBuild } from "./validate.js";
import { Trait } from "../schema/index.js";

// Knowledges need Memory 3 and up, out of reach for these level 1 fixtures,
// so the rules are tested without Knowledge minimum stats. validate.test.ts
// checks the real ones.
const loaded = loadContent().content;
const content = { ...loaded, traits: loaded.traits.map((t) => (t.category === "knowledge" ? { ...t, minStats: {} } : t)) };
const isek = content.kinds.find((k) => k.id === "isek")!.stats!;

// These fixtures are level 1 characters; the default campaign starts at 3.
const L1 = { startingLevel: 1 };

const solve = (concept: ConceptInput, level = 1) => {
  const out = solveConcept(concept, content, { startingLevel: level });
  if ("error" in out) throw new Error(out.error);
  return out as Solution;
};

const hunter: ConceptInput = {
  kind: "isek",
  origin: "dreft",
  profession: "guild-hunter",
  past: "noble-household",
  focus: ["grace", "power"],
  traits: ["survivalist", "vigilance", "fireball", "monsters-of-isekai", "streetwise", "haggler"],
};

describe("allocateLevels", () => {
  it("puts each level's points into the priority stats in turn", () => {
    expect(allocateLevels(["grace", "power"], isek, 1)).toEqual([{ group: "physical", points: { grace: 2, power: 1 } }]);
  });

  it("rotates levels through the priority stats' groups, in priority order", () => {
    const levels = allocateLevels(["grace", "intuition"], isek, 3);
    expect(levels.map((l) => l.group)).toEqual(["physical", "mental", "physical"]);
    expect(levels[1]!.points).toEqual({ intuition: 3 });
  });

  it("moves points to the group's other stats when a priority stat is at its max", () => {
    const capped = { ...isek, grace: { start: 18, max: 18 } };
    expect(allocateLevels(["grace"], capped, 1)).toEqual([{ group: "physical", points: { power: 2, endurance: 1 } }]);
  });

  // Points per stat across a list of levels
  const totals = (levels: ReturnType<typeof allocateLevels>) => {
    const out: Record<string, number> = {};
    for (const l of levels) for (const [s, n] of Object.entries(l.points)) out[s] = (out[s] ?? 0) + (n ?? 0);
    return out;
  };

  it("keeps the first two levels entirely on the priority stats", () => {
    expect(totals(allocateLevels(["persuasion"], isek, 2))).toEqual({ persuasion: 6 });
  });

  it("spreads a little more as the level rises", () => {
    const levels = allocateLevels(["persuasion", "memory"], isek, 10);
    const t = totals(levels);
    // Level 6 goes to the group with the fewest levels: Physical, outside the priorities.
    expect(levels[5]!.group).toBe("physical");
    expect(levels.filter((l) => l.group === "physical")).toHaveLength(1);
    // The breadth level builds Physical's weakest stats, not just one.
    expect(Object.keys(levels[5]!.points).length).toBeGreaterThan(1);
    // Every other Social and Mental level gives a point to the group's weakest stat.
    expect(t.empathy! + t.demeanor!).toBeGreaterThan(0);
    expect(t.logic! + t.intuition!).toBeGreaterThan(0);
    // The specialty still comes first.
    expect(t.persuasion).toBeGreaterThan(Math.max(t.empathy ?? 0, t.demeanor ?? 0));
    expect(t.memory).toBeGreaterThan(Math.max(t.logic ?? 0, t.intuition ?? 0));
  });

  it("still allocates every level with no priority stats", () => {
    const levels = allocateLevels([], isek, 2);
    expect(levels).toHaveLength(2);
    for (const l of levels) expect(Object.values(l.points).reduce((a, b) => a + (b ?? 0), 0)).toBe(3);
  });
});

describe("solveConcept", () => {
  it("builds a legal character from the concept, buying Traits in order", () => {
    const s = solve(hunter);
    expect(s.result.ok).toBe(true);
    expect(validateBuild(s.build, content, L1).ok).toBe(true);
    expect(s.taken).toEqual(["survivalist", "vigilance", "streetwise", "haggler"]);
    expect(s.skipped).toEqual([
      { trait: "fireball", reason: 'Trait "fireball" doesn\'t exist' },
      { trait: "monsters-of-isekai", reason: "already held (from profession guild-hunter)" },
    ]);
    expect(s.build.traits.slice(0, 4).map((t) => t.trait)).toEqual(s.taken);
  });

  it("leaves picks the list didn't use banked, instead of filling them from the Background Trait list", () => {
    const s = solve(hunter);
    expect(s.result.summary!.backgroundList.length).toBeGreaterThan(0);
    expect(s.build.traits.map((t) => t.trait)).toEqual(s.taken);
    expect(s.result.summary!.picks.background.banked).toBeGreaterThan(0);
  });

  it("buys a second rank when a ranked Trait is listed twice", () => {
    const s = solve({ ...hunter, traits: ["seafaring", "seafaring"] });
    expect(s.build.traits.filter((t) => t.trait === "seafaring").map((t) => t.rank)).toEqual([1, 2]);
  });

  it("buys the next rank of a ranked Trait a package already grants", () => {
    const s = solve({ ...hunter, traits: ["dreft"] });
    expect(s.build.traits.filter((t) => t.trait === "dreft").map((t) => t.rank)).toEqual([2]);
  });

  it("stops buying when the picks run out", () => {
    const many = content.traits.filter((t) => !t.background).map((t) => t.id);
    const s = solve({ ...hunter, traits: many });
    expect(s.result.ok).toBe(true);
    expect(s.result.summary!.picks.universal.banked).toBe(0);
    expect(s.skipped.some((x) => x.reason === "no picks left")).toBe(true);
  });

  it("answers choices it can check, and keeps a valid answer from the concept", () => {
    const s = solve({ ...hunter, origin: "dreft", past: "merchant-dynasty", choices: [{ package: "merchant-dynasty", from: "language", traits: ["english"] }] });
    expect(s.build.choices).toEqual([{ package: "merchant-dynasty", from: "language", traits: ["english"] }]);
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
    // Dreft grants spoken Dreftan, so the first language the build doesn't hold is written Dreftan.
    expect(answer).toEqual({ trait: "additional-language", from: "language", traits: ["dreftan-written"] });
    expect(s.build.choices.some((c) => c.trait === "additional-contact")).toBe(false);
    expect(s.result.ok).toBe(true);
    expect(s.result.warnings.map((w) => w.message)).toContain("Additional Contact gives 1 Contact: record who on the Choices step");
  });

  it("keeps the concept's answer to a Trait's choice, and skips languages the build holds", () => {
    const languageOf = (s: Solution) => s.build.choices.find((c) => c.trait === "additional-language")!.traits;
    const asked = (traits: string[]): ConceptInput => ({ ...hunter, traits: ["additional-language"], choices: [{ trait: "additional-language", from: "language", traits }] });
    // Spoken Dreftan comes with the Dreft Origin, so the solver takes the next language instead.
    expect(languageOf(solve(asked(["dreftan"])))).toEqual(["dreftan-written"]);
    // With a third language in content, the concept's pick wins over pool order.
    const cant = Trait.parse({ id: "trade-cant", name: "Trade Cant", status: "placeholder", plane: "isekai", summary: "Test fixture.", category: "knowledge", types: ["language"], effect: "Test only." });
    const s = solveConcept(asked(["trade-cant"]), { ...content, traits: [...content.traits, cant] }, L1) as Solution;
    expect(languageOf(s)).toEqual(["trade-cant"]);
    expect(s.result.ok).toBe(true);
  });

  it("answers the Tetra Origin's language with one language, spoken and written", () => {
    const s = solve({ ...hunter, origin: "tetra", traits: [], choices: [{ package: "tetra", from: "spoken-and-written-language", traits: ["english"] }] });
    expect(s.build.choices).toEqual([{ package: "tetra", from: "spoken-and-written-language", traits: ["english"] }]);
    expect(s.result.summary!.traits.map((h) => h.trait)).toEqual(expect.arrayContaining(["english", "english-written"]));
    expect(s.result.ok).toBe(true);
  });

  it("places a Kind's free level 0 points in the priority stats", () => {
    const s = solve({ ...hunter, kind: "ai-core", focus: ["logic", "persuasion", "power"], traits: [] });
    // Power has a max of 0 for an AI Core, so it's skipped.
    expect(s.build.startPoints).toEqual({ logic: 2, persuasion: 1 });
    expect(s.result.ok).toBe(true);
  });

  it("buys nothing when the Kind or a package is wrong", () => {
    const s = solve({ ...hunter, kind: "dragon" });
    expect(s.result.ok).toBe(false);
    expect(s.build.traits).toEqual([]);
    expect(s.result.errors.map((e) => e.code)).toContain("kind");
  });

  it("reports a concept that doesn't match the format", () => {
    expect(solveConcept({ kind: "isek" }, content, L1)).toEqual({ error: expect.stringContaining("origin") });
  });

  it("sends back names given where ids belong, instead of failing to build", () => {
    const out = solveConcept({ kind: "Isek", origin: "Dreft", profession: "guild-hunter", past: "Countryside Upbringing" }, content, L1);
    expect(out).toEqual({ error: expect.stringContaining('origin: must be a package id like "dreft", not a name') });
    expect((out as { error: string }).error).toMatch(/kind: .*past: /);
  });
});

// No ranked Trait in content has rankStats yet, so these tests give Dreftian
// Law and Seafaring a Memory requirement, and the Isek a Memory start that a
// level can raise to 6. Licensed Mage grants Dreftian Law (1); no package the
// hunter uses grants Seafaring.
describe("rank stats among the priority stats", () => {
  const ranked = {
    ...content,
    traits: content.traits.map((t) => (["dreftian-law", "seafaring"].includes(t.id) ? { ...t, rankStats: ["memory" as const] } : t)),
    kinds: content.kinds.map((k) => (k.id === "isek" ? { ...k, stats: { ...k.stats!, memory: { start: 3, max: 15 } } } : k)),
  };
  // Listing a granted Trait once asks for rank 2.
  const mage: ConceptInput = { ...hunter, profession: "licensed-mage", traits: ["dreftian-law"] };
  const focusOf = (c: ConceptInput) => rankFocus(Concept.parse(c), ranked);

  it("adds the stats a requested rank above 1 needs, after the model's priority stats", () => {
    expect(focusOf(mage)).toEqual(["grace", "power", "memory"]);
  });

  it("counts a Trait listed twice as rank 2", () => {
    expect(focusOf({ ...hunter, traits: ["seafaring", "seafaring"] })).toEqual(["grace", "power", "memory"]);
  });

  it("leaves the priority stats alone for rank 1 and for stats already among them", () => {
    expect(focusOf({ ...hunter, traits: ["seafaring"] })).toEqual(["grace", "power"]);
    expect(focusOf({ ...mage, focus: ["memory", "grace"] })).toEqual(["memory", "grace"]);
  });

  it("raises the stat so the rank can be bought", () => {
    const out = solveConcept(mage, ranked, { startingLevel: 2 }) as Solution;
    expect(out.build.levels.map((l) => l.group)).toEqual(["physical", "mental"]);
    expect(out.taken).toContain("dreftian-law");
    expect(out.build.traits).toContainEqual({ trait: "dreftian-law", rank: 2, pick: expect.any(String) });
  });
});
