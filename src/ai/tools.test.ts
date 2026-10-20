import { describe, expect, it } from "vitest";
import type { BuildInput } from "../engine/build.js";
import { loadContent } from "../engine/content.js";
import { validateBuild } from "../engine/validate.js";
import { contentIndex } from "./prompt.js";
import { checkBuild, openChoices, runTool, ToolError, TOOLS, unknownIds } from "./tools.js";

const { content } = loadContent();

// The engine accepts this build; its choices are all from resolvable pools.
const orcoid: BuildInput = {
  kind: "tatot-orcoid",
  origin: "dreft",
  profession: "gate-hand",
  past: "sunrise-refugee",
  level: 1,
  levels: [{ group: "social", points: { persuasion: 2, demeanor: 1 } }],
  traits: [
    { trait: "ambusher", rank: 1, pick: "universal" },
    { trait: "vigilance", rank: 1, pick: "universal" },
  ],
  choices: [],
};

// Caravaneer asks for a Contact, and no Contacts exist yet.
const caravaneer: BuildInput = {
  kind: "isek",
  origin: "dreft",
  profession: "caravaneer",
  past: "noble-household",
  level: 1,
  levels: [{ group: "physical", points: { power: 1, grace: 2 } }],
  traits: [{ trait: "tracker", rank: 1, pick: "universal" }],
  choices: [],
};

describe("search_traits", () => {
  it("finds Traits by words in the name, summary or tags", () => {
    const out = runTool("search_traits", { query: "tracking" }, content) as { traits: { id: string }[] };
    expect(out.traits[0]!.id).toBe("tracker");
  });

  it("filters by category and tag", () => {
    const out = runTool("search_traits", { category: "knowledge", tags: ["sea"] }, content) as { traits: { id: string; category: string }[] };
    expect(out.traits.length).toBeGreaterThan(0);
    for (const t of out.traits) expect(t.category).toBe("knowledge");
  });

  it("returns only Traits on the build's Background list for background picks", () => {
    const build = { kind: "isek", origin: "dreft", profession: "caravaneer", past: "merchant-dynasty" };
    const out = runTool("search_traits", { pick: "background", ...build, limit: 100 }, content) as { traits: { id: string }[] };
    const list = validateBuild({ ...build, levels: [] }, content).summary!.backgroundList;
    expect(out.traits.map((t) => t.id).sort()).toEqual(list);
    expect(out.traits.length).toBeGreaterThan(0);
  });

  it("asks for the build's packages before filtering background picks", () => {
    expect(() => runTool("search_traits", { pick: "background" }, content)).toThrow(ToolError);
  });
});

describe("packages and Kinds", () => {
  it("lists packages of one type", () => {
    const out = runTool("list_packages", { type: "profession" }, content) as { id: string }[];
    expect(out.map((p) => p.id)).toContain("hedge-witch");
    expect(out.every((p) => content.packages.find((x) => x.id === p.id)?.type === "profession")).toBe(true);
  });

  it("gets a package and marks pools with no Traits as left for the player", () => {
    const out = runTool("get_package", { id: "caravaneer" }, content) as { choices: { from: string; leftForPlayer?: boolean }[] };
    expect(out.choices).toEqual([expect.objectContaining({ from: "contact", leftForPlayer: true })]);
    const merchant = runTool("get_package", { id: "merchant-dynasty" }, content) as { choices: { pool: { id: string }[] }[] };
    expect(merchant.choices[0]!.pool.map((t) => t.id)).toContain("english");
    const dreft = runTool("get_package", { id: "dreft" }, content) as { choices: unknown[]; backgroundTraits: { id: string }[] };
    expect(dreft.choices).toEqual([]);
    expect(dreft.backgroundTraits.map((t) => t.id)).toContain("glintl");
  });

  it("gets a Kind with its stats", () => {
    const out = runTool("get_kind", { id: "tatot-goblinoid" }, content) as { name: string; stats: { logic: { start: number; max: number } } };
    expect(out.name).toBe("Goblinoid Tatot");
    expect(out.stats.logic).toEqual({ start: 2, max: 18 });
  });

  it("errors on unknown ids and bad input", () => {
    expect(() => runTool("get_package", { id: "pirate-king" }, content)).toThrow(ToolError);
    expect(() => runTool("get_kind", { id: "dragon" }, content)).toThrow(ToolError);
    expect(() => runTool("list_packages", { type: "hobby" }, content)).toThrow(ToolError);
    expect(() => runTool("summon", {}, content)).toThrow(ToolError);
  });
});

describe("checkBuild", () => {
  it("returns the engine's verdict and pick summary", () => {
    const out = checkBuild(orcoid, content);
    expect(out.accepted).toBe(true);
    expect(out.legal).toBe(true);
    expect(out.summary!.picks.universal.spent).toBe(2);
    expect(out.errors).toEqual(validateBuild(orcoid, content).errors);
  });

  it("passes the engine's errors through", () => {
    const bad = { ...orcoid, levels: [{ group: "social", points: { persuasion: 4 } }] };
    const out = checkBuild(bad, content);
    expect(out.accepted).toBe(false);
    expect(out.errors.map((e) => e.code)).toContain("allocation");
  });

  it("rejects unknown ids, including answers the engine would only warn about", () => {
    const build = {
      ...orcoid,
      kind: "tatot",
      traits: [{ trait: "dragon-riding", rank: 1, pick: "universal" }],
      choices: [{ package: "caravaneer", from: "contact", traits: ["harbor-master-oyl"] }],
      profession: "caravaneer",
    };
    const ids = unknownIds(build, content);
    expect(ids.map((i) => i.path)).toEqual(["kind", "traits[0]", "choices[0]"]);
    expect(ids[2]!.message).toContain("The player decides who their Contact is");
    expect(checkBuild(build, content).accepted).toBe(false);
  });

  it("leaves Contacts to the player, and the build is still legal", () => {
    expect(openChoices(caravaneer, content)).toEqual([{ package: "caravaneer", from: "contact", count: 1, note: "1 additional Contact" }]);
    const out = checkBuild(caravaneer, content);
    expect(out.accepted).toBe(true);
    expect(out.legal).toBe(true);
    expect(out.warnings).toEqual([expect.objectContaining({ code: "choice", message: "Caravaneer gives 1 Contact: record who on the Choices step" })]);
  });
});

describe("Trait choices", () => {
  const withContact = { ...caravaneer, traits: [...caravaneer.traits!, { trait: "additional-contact", rank: 1, pick: "universal" as const }] };

  it("leaves a held Trait's Contact to the player too", () => {
    expect(openChoices(withContact, content)).toEqual([
      { package: "caravaneer", from: "contact", count: 1, note: "1 additional Contact" },
      { trait: "additional-contact", from: "contact", count: 1, note: "1 Contact per rank" },
    ]);
    const out = checkBuild(withContact, content);
    expect(out.accepted).toBe(true);
    expect(out.legal).toBe(true);
  });

  it("rejects an answer to a Trait's Contact, and an answer for a Trait that doesn't exist", () => {
    const build = {
      ...withContact,
      choices: [
        { trait: "additional-contact", from: "contact", traits: ["Wenna"] },
        { trait: "extra-language", from: "language", traits: ["english"] },
      ],
    };
    const ids = unknownIds(build, content);
    expect(ids.map((i) => i.path)).toEqual(["choices[0]", "choices[1]"]);
    expect(ids[0]!.message).toContain("The player decides who their Contact is");
    expect(ids[1]!.message).toBe(`Trait "extra-language" doesn't exist`);
  });

  it("lists Trait choices in the Trait search results and the content index", () => {
    const out = runTool("search_traits", { query: "additional language" }, content) as { traits: { id: string; choices: unknown[] }[] };
    const hit = out.traits[0];
    expect(hit!.id).toBe("additional-language");
    expect(hit!.choices).toEqual([{ choose: 1, from: "language", note: "1 language per rank" }]);
    expect(contentIndex(content)).toContain("choices 1 from language per rank");
  });
});

describe("prompt prefix", () => {
  it("lists every id and doesn't change between calls", () => {
    const index = contentIndex(content);
    for (const id of [...content.kinds, ...content.packages, ...content.traits].map((x) => x.id)) {
      expect(index).toContain(`- ${id}:`);
    }
    expect(contentIndex(content)).toBe(index);
  });

  it("has a tool for every name the loop handles", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["search_traits", "list_packages", "get_package", "get_kind", "submit_build"]);
  });
});
