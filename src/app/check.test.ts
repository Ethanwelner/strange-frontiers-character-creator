import { describe, expect, it } from "vitest";
import { loadContent, type Content } from "../engine/content.js";
import { Trait } from "../schema/index.js";
import { check, stepOf, traitOptions } from "./check.js";
import { content as appContent, contentErrors } from "./content.js";
import { addPick, fromBuild, levelsToPool, poolToLevels, toBuild, withCore, withLevel, type Draft } from "./draft.js";

const campaign = { startingLevel: 1 };

// Knowledges need Memory 3 and up, out of reach for these level 1 fixtures,
// so the rules are tested without Knowledge minimum stats. validate.test.ts
// checks the real ones.
const bundled: Content = {
  ...appContent,
  traits: appContent.traits.map((t) => (t.category === "knowledge" ? { ...t, minStats: {} } : t)),
};

const human: Draft = {
  name: "Harbor-born guard",
  kind: "human",
  origin: "dreft",
  profession: "royal-guard",
  past: "noble-household",
  level: 1,
  core: { physical: 1, social: 0, mental: 0 },
  points: { power: 1, grace: 2 },
  traits: [{ trait: "tracker", rank: 1, pick: "universal" }],
  choices: [],
};

describe("bundled content", () => {
  it("matches what the engine loads from disk", () => {
    expect(contentErrors).toEqual([]);
    const disk = loadContent().content;
    const ids = (c: Content) => ({
      kinds: c.kinds.map((k) => k.id).sort(),
      packages: c.packages.map((p) => p.id).sort(),
      traits: c.traits.map((t) => t.id).sort(),
    });
    expect(ids(bundled)).toEqual(ids(disk));
  });
});

describe("traitOptions", () => {
  const heirloom = Trait.parse({
    id: "fixture-heirloom-blade",
    name: "Heirloom Blade",
    status: "placeholder",
    plane: "isekai",
    summary: "Test fixture: a Background Trait.",
    category: "starter",
    background: true,
    effect: "Test only.",
  });
  const withFixture: Content = { ...bundled, traits: [...bundled.traits, heirloom] };

  it("waits for a complete build", () => {
    expect(traitOptions({ ...human, kind: undefined }, bundled, campaign, "universal")).toBeUndefined();
  });

  it("keeps Background Traits off universal picks", () => {
    const ids = traitOptions(human, withFixture, campaign, "universal")!.map((o) => o.trait.id);
    expect(ids).not.toContain("fixture-heirloom-blade");
    expect(ids).toContain("survivalist");
  });

  it("lists only the Background Trait list for background picks", () => {
    const isek: Draft = { ...human, kind: "isek", traits: [] };
    const ids = traitOptions(isek, bundled, campaign, "background")!.map((o) => o.trait.id);
    // Isek have military, guild and caravan access.
    expect(ids).toContain("shield-wall");
    expect(ids).not.toContain("tracker");
  });

  it("gives the engine's reasons for picks it would reject", () => {
    const options = traitOptions(human, bundled, campaign, "universal")!;
    const byId = new Map(options.map((o) => [o.trait.id, o]));
    // Royal Guard grants Vigilance; Tracker is already picked.
    expect(byId.get("vigilance")!.reasons.join()).toMatch(/already held/);
    expect(byId.get("tracker")!.reasons.join()).toMatch(/can't be taken twice/);
    expect(byId.get("survivalist")!.reasons).toEqual([]);
    // Dreft grants Dreft 1, so the next pick buys rank 2.
    expect(byId.get("dreft")!.rank).toBe(2);
  });

  it("offers a Trait with a choice, which is answered on the Choices step afterward", () => {
    const options = traitOptions(human, bundled, campaign, "universal")!;
    expect(options.find((o) => o.trait.id === "additional-language")!.reasons).toEqual([]);
    const taken = addPick(human, "additional-language", 1, "universal");
    const result = check(taken, bundled, campaign);
    expect(result.summary!.questions.at(-1)).toEqual(expect.objectContaining({ by: "trait", id: "additional-language", from: "language" }));
    expect(stepOf(result.errors.find((e) => e.message.startsWith("Additional Language"))!)).toBe("choices");
  });

  it("puts a starting level mismatch on the Character step and missing allocations on Stats", () => {
    const result = check({ ...human, level: 2 }, bundled, campaign);
    const steps = result.errors.filter((e) => e.code === "level").map((e) => stepOf(e));
    expect(steps).toEqual(["character", "stats"]);
  });

  it("puts a missing Kind on the Character step, which now holds the Kind cards", () => {
    const result = check({ ...human, kind: undefined }, bundled, campaign);
    expect(result.errors.some((e) => stepOf(e) === "character")).toBe(true);
  });

  it("never offers a Conveyed Trait", () => {
    for (const pick of ["universal", "background"] as const) {
      const ids = traitOptions(human, bundled, campaign, pick)!.map((o) => o.trait.id);
      expect(ids).not.toContain("imperial-service-record");
      expect(ids).not.toContain("explorers-lodge-membership");
    }
  });

  it("rejects everything once the picks run out", () => {
    // Isek power 3 and grace 4 give 3 background picks.
    const isek: Draft = { ...human, kind: "isek", traits: [] };
    const first = traitOptions(isek, bundled, campaign, "background")!.filter((o) => o.reasons.length === 0);
    expect(first.length).toBeGreaterThan(3);
    const spent: Draft = {
      ...isek,
      traits: first.slice(0, 3).map((o) => ({ trait: o.trait.id, rank: o.rank, pick: "background" as const })),
    };
    const after = traitOptions(spent, bundled, campaign, "background")!;
    expect(after.length).toBeGreaterThan(0);
    for (const o of after) expect(o.reasons.join()).toMatch(/spends 4 background picks/);
  });
});

describe("stat pool errors", () => {
  it("asks for the core points still to place", () => {
    const errors = check(withLevel(human, 3), bundled, { startingLevel: 3 }).errors;
    expect(errors.map((e) => e.message)).toContain("Place 2 more core points");
  });

  it("says once per group how many focus points are left", () => {
    const short: Draft = { ...withLevel(human, 2), core: { physical: 2, social: 0, mental: 0 }, points: { power: 1 } };
    const messages = check(short, bundled, { startingLevel: 2 }).errors.map((e) => e.message);
    expect(messages.filter((m) => m.includes("Physical"))).toEqual(["Place 5 more Physical points"]);
    expect(stepOf(check(short, bundled, { startingLevel: 2 }).errors.find((e) => e.message.includes("Physical"))!)).toBe("stats");
  });
});

describe("drafts", () => {
  it("reloads a saved draft's stat pool", () => {
    expect(fromBuild(JSON.parse(JSON.stringify(human)))).toEqual(human);
  });

  it("round-trips through an exported Build", () => {
    expect(fromBuild(JSON.parse(JSON.stringify(toBuild(human))))).toEqual(human);
  });

  it("splits the stats pool into one allocation per level, and back", () => {
    const levels = poolToLevels({ physical: 2, social: 0, mental: 1 }, { power: 4, grace: 2, logic: 3 });
    expect(levels).toEqual([
      { group: "physical", points: { power: 3 } },
      { group: "physical", points: { power: 1, grace: 2 } },
      { group: "mental", points: { logic: 3 } },
    ]);
    expect(levelsToPool(levels)).toEqual({ core: { physical: 2, social: 0, mental: 1 }, points: { power: 4, grace: 2, logic: 3 } });
  });

  it("keeps the pool when the level goes up, and takes core points back from Mental first when it goes down", () => {
    const three = withCore(withCore(withLevel(human, 3), "social", 1), "mental", 1);
    expect(three.core).toEqual({ physical: 1, social: 1, mental: 1 });
    expect(three.points).toEqual(human.points);
    expect(withLevel(three, 1)).toEqual({ ...human, level: 1 });
  });

  it("takes back the focus points a core point unlocked", () => {
    expect(withCore(human, "physical", 0).points).toEqual({});
  });

  it("loads an old Tatot build, from before the forms became Kinds, as the matching Kind", () => {
    const old = fromBuild({ ...toBuild(human), kind: "tatot", form: "goblinoid" });
    expect(old.kind).toBe("tatot-goblinoid");
    expect(old).not.toHaveProperty("form");
  });
});
