import { describe, expect, it } from "vitest";
import { BackgroundPackage, Trait } from "../schema/index.js";
import { loadContent, type Content } from "./content.js";
import type { BuildInput } from "./build.js";
import { validateBuild, type IssueCode } from "./validate.js";

const loaded = loadContent();
const content = loaded.content;

// The real content has no Background, starter-only, prerequisite or
// rank-stat Traits yet, and only two languages, so the rules that need them
// are tested with these.
const fixtures = [
  Trait.parse({
    id: "fixture-heirloom-blade",
    name: "Heirloom Blade",
    status: "placeholder",
    plane: "isekai",
    summary: "Test fixture: a starter-only Background Trait.",
    tags: ["military"],
    category: "starter",
    background: true,
    starterOnly: true,
    effect: "Test only.",
  }),
  Trait.parse({
    id: "fixture-master-tracker",
    name: "Master Tracker",
    status: "placeholder",
    plane: "isekai",
    summary: "Test fixture: needs Tracker.",
    category: "skill",
    prerequisites: ["tracker"],
    effect: "Test only.",
  }),
  Trait.parse({
    id: "fixture-swordplay",
    name: "Swordplay",
    status: "placeholder",
    plane: "isekai",
    summary: "Test fixture: ranked on Power and Grace.",
    category: "skill",
    ranked: true,
    rankStats: ["power", "grace"],
    effect: "Test only.",
  }),
  Trait.parse({
    id: "fixture-trade-cant",
    name: "Trade Cant",
    status: "placeholder",
    plane: "isekai",
    summary: "Test fixture: a third language.",
    category: "knowledge",
    types: ["language"],
    effect: "Test only.",
  }),
];
const withFixtures: Content = { ...content, traits: [...content.traits, ...fixtures] };

// These fixtures are level 1 characters; the default campaign starts at 3.
const L1 = { startingLevel: 1 };

function check(build: BuildInput, c: Content = content, campaign: { startingLevel: number } = L1) {
  return validateBuild(build, c, campaign);
}

function codes(result: ReturnType<typeof check>): IssueCode[] {
  return result.errors.map((e) => e.code);
}

function expectLegal(result: ReturnType<typeof check>) {
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
}

// Legal sample characters, one per Kind.
const human: BuildInput = {
  name: "Harbor-born guard",
  kind: "human",
  origin: "dreft",
  profession: "royal-guard",
  past: "noble-household",
  levels: [{ group: "physical", points: { power: 1, grace: 2 } }],
  traits: [
    { trait: "survivalist", pick: "universal" },
    { trait: "tracker", pick: "universal" },
    { trait: "farming", pick: "universal" },
    { trait: "dreft", rank: 2, pick: "universal" },
  ],
};

const isek: BuildInput = {
  name: "Isek caravan rider",
  kind: "isek",
  origin: "dreft",
  profession: "caravaneer",
  past: "merchant-dynasty",
  levels: [{ group: "physical", points: { power: 1, grace: 2 } }],
  traits: [
    { trait: "shield-wall", pick: "background" },
    { trait: "caravan-routes", pick: "background" },
    { trait: "the-switch-port", pick: "background" },
    { trait: "tracker", pick: "universal" },
  ],
  choices: [
    { package: "caravaneer", from: "contact", traits: ["Harbor Master Oyl"] },
    { package: "merchant-dynasty", from: "language", traits: ["english"] },
  ],
};

const orcoid: BuildInput = {
  name: "Orcoid gate hand",
  kind: "tatot-orcoid",
  origin: "dreft",
  profession: "gate-hand",
  past: "sunrise-refugee",
  levels: [{ group: "social", points: { persuasion: 2, demeanor: 1 } }],
  traits: [
    { trait: "ambusher", pick: "universal" },
    { trait: "vigilance", pick: "universal" },
  ],
};

const goblinoid: BuildInput = {
  name: "Goblinoid licensed mage",
  kind: "tatot-goblinoid",
  origin: "dreft",
  profession: "licensed-mage",
  past: "raised-in-the-caravan-town",
  levels: [{ group: "mental", points: { logic: 1, memory: 2 } }],
  traits: [
    { trait: "tinkerer", pick: "universal" },
    { trait: "dreft", rank: 2, pick: "universal" },
    { trait: "herbalism", pick: "universal" },
  ],
};

const guwain: BuildInput = {
  name: "Guwain hedge witch",
  kind: "guwain",
  origin: "dreft",
  profession: "hedge-witch",
  past: "raised-in-the-caravan-town",
  levels: [{ group: "physical", points: { endurance: 2, power: 1 } }],
  traits: [
    { trait: "survivalist", pick: "universal" },
    { trait: "dreft", rank: 2, pick: "universal" },
  ],
};

describe("content", () => {
  it("loads without errors", () => {
    expect(loaded.errors).toEqual([]);
    expect(content.kinds.length).toBeGreaterThan(0);
  });
});

describe("legal Dreft characters", () => {
  it("Human", () => {
    const r = check(human);
    expectLegal(r);
    expect(r.warnings).toEqual([]);
    expect(r.summary!.stats).toMatchObject({ power: 2, grace: 3, memory: 1 });
    expect(r.summary!.coreStats).toEqual({ physical: 1, social: 0, mental: 0 });
    expect(r.summary!.picks.universal).toEqual({ available: 10, spent: 4, banked: 6 });
    expect(r.summary!.picks.background).toEqual({ available: 2, spent: 0, banked: 2 });
  });

  it("Isek", () => {
    const r = check(isek);
    expectLegal(r);
    expect(r.warnings).toEqual([]);
    expect(r.summary!.picks.background).toEqual({ available: 3, spent: 3, banked: 0 });
    expect(r.summary!.backgroundList).toContain("shield-wall");
  });

  it("Orcoid Tatot", () => {
    const r = check(orcoid);
    expectLegal(r);
    expect(r.warnings).toEqual([]);
    expect(r.summary!.stats).toMatchObject({ power: 2, persuasion: 3, demeanor: 2 });
  });

  it("Goblinoid Tatot", () => {
    const r = check(goblinoid);
    expectLegal(r);
    expect(r.warnings).toEqual([]);
    expect(r.summary!.stats).toMatchObject({ power: 0, logic: 3, memory: 3 });
    expect(r.summary!.traits.find((t) => t.trait === "dreft")!.rank).toBe(2);
  });

  it("Guwain", () => {
    const r = check(guwain);
    expectLegal(r);
    expect(r.warnings).toEqual([]);
    expect(r.summary!.stats).toMatchObject({ endurance: 4, power: 3, grace: 0 });
  });
});

describe("schema", () => {
  it("rejects a build that isn't shaped like one", () => {
    const r = validateBuild({ kind: "human" }, content, L1);
    expect(r.ok).toBe(false);
    expect(new Set(codes(r))).toEqual(new Set(["schema"]));
    expect(r.summary).toBeUndefined();
  });
});

describe("rule 1: level 0 stats come from the Kind", () => {
  it("takes each Tatot Kind's own stats", () => {
    expect(check(orcoid).summary!.stats).toMatchObject({ endurance: 2, logic: 0 });
    expect(check(goblinoid).summary!.stats).toMatchObject({ endurance: 1, logic: 3 });
  });

  it("rejects an unknown Kind", () => {
    expect(codes(check({ ...human, kind: "dragon" }))).toContain("kind");
  });
});

describe("rule 2: starting level comes from the campaign", () => {
  const level3: BuildInput = {
    ...human,
    level: 3,
    levels: [
      { group: "physical", points: { power: 1, grace: 2 } },
      { group: "social", points: { empathy: 3 } },
      { group: "mental", points: { memory: 2, logic: 1 } },
    ],
  };

  it("allows a higher start when the campaign says so", () => {
    expectLegal(check(level3, content, { startingLevel: 3 }));
  });

  it("starts at level 3 when no campaign says otherwise", () => {
    expectLegal(validateBuild(level3, content));
  });

  it("rejects a level that doesn't match the campaign", () => {
    expect(codes(check(level3))).toEqual(["level"]);
  });

  it("needs one allocation per level", () => {
    expect(codes(check({ ...human, levels: [] }))).toContain("level");
  });
});

describe("rule 3: each level is 1 core point and 3 focus points", () => {
  it("rejects the wrong number of focus points", () => {
    const r = check({ ...human, levels: [{ group: "physical", points: { power: 2, grace: 2 } }] });
    expect(codes(r)).toContain("allocation");
  });

  it("rejects points outside the level's group", () => {
    const r = check({ ...human, levels: [{ group: "physical", points: { power: 2, memory: 1 } }] });
    expect(codes(r)).toEqual(["allocation"]);
  });
});

describe("rule 4: stat maximums", () => {
  it("keeps an AI Core out of Physical stats, which its chassis decides", () => {
    const aiCore = { ...human, kind: "ai-core", startPoints: { empathy: 3 }, traits: [] };
    expectLegal(check({ ...aiCore, levels: [{ group: "mental", points: { logic: 3 } }] }));
    expect(codes(check({ ...aiCore, levels: [{ group: "physical", points: { power: 3 } }] }))).toEqual(["stat-max"]);
    expect(codes(check({ ...aiCore, startPoints: { power: 3 }, levels: [{ group: "mental", points: { logic: 3 } }] }))).toEqual(["stat-max"]);
  });

  it("needs a Kind's free level 0 points placed, and only a Kind that has them", () => {
    const aiCore = { ...human, kind: "ai-core", traits: [], levels: [{ group: "mental" as const, points: { logic: 3 } }] };
    const r = check({ ...aiCore, startPoints: { empathy: 2, logic: 1 } });
    expectLegal(r);
    expect(r.summary!.stats).toMatchObject({ empathy: 2, logic: 6, memory: 2 });
    expect(check({ ...aiCore, startPoints: { empathy: 2 } }).errors).toEqual([
      expect.objectContaining({ code: "allocation", message: "AI Core gives 3 level 0 points to place, but the build places 2", path: "startPoints" }),
    ]);
    expect(check({ ...human, startPoints: { grace: 1 } }).errors).toEqual([
      expect.objectContaining({ code: "allocation", message: "Human has no level 0 points to place, but the build places 1" }),
    ]);
  });

  it("rejects a stat above its Kind max", () => {
    // Human grace: 1 + 3 × 5 = 16, above the Human max of 15.
    const levels = Array.from({ length: 5 }, () => ({ group: "physical" as const, points: { grace: 3 } }));
    const r = check({ ...human, level: 5, levels, traits: [] }, content, { startingLevel: 5 });
    expect(codes(r)).toEqual(["stat-max"]);
  });

  it("rejects anything above 20", () => {
    // Guwain endurance: 2 + 3 × 7 = 23.
    const levels = Array.from({ length: 7 }, () => ({ group: "physical" as const, points: { endurance: 3 } }));
    const r = check({ ...guwain, level: 7, levels, traits: [] }, content, { startingLevel: 7 });
    expect(codes(r)).toEqual(["stat-cap"]);
  });
});

describe("rule 5: odd points are universal picks, even points background", () => {
  it("counts circles and squares on every stat", () => {
    const r = check({ ...human, levels: [{ group: "social", points: { empathy: 3 } }], traits: [] });
    // empathy 4 → 2 universal, 2 background; the other eight stats → 1 universal each.
    expect(r.summary!.picks.universal.available).toBe(10);
    expect(r.summary!.picks.background.available).toBe(2);
    const base = check({ ...human, levels: [{ group: "social", points: { empathy: 1, persuasion: 1, demeanor: 1 } }], traits: [] });
    // Three stats at 2 add three squares: still 9 universal, now 3 background.
    expect(base.summary!.picks.universal.available).toBe(9);
    expect(base.summary!.picks.background.available).toBe(3);
  });

  it("rejects spending more background picks than the stats give", () => {
    const r = check({
      ...isek,
      traits: [
        { trait: "shield-wall", pick: "background" },
        { trait: "caravan-routes", pick: "background" },
        { trait: "the-switch-port", rank: 1, pick: "background" },
        { trait: "the-switch-port", rank: 2, pick: "background" },
      ],
    });
    expect(codes(r)).toEqual(["picks-overspent"]);
  });
});

describe("rule 6: package grants and choices", () => {
  it("includes grants without spending picks", () => {
    const r = check({ ...orcoid, traits: [] });
    expectLegal(r);
    expect(r.summary!.picks.universal.spent).toBe(0);
    const held = r.summary!.traits.map((t) => t.trait);
    expect(held).toEqual(expect.arrayContaining(["dreft", "dreftian-law", "dreftan", "smooth-talker", "survivalist"]));
  });

  it("rejects a package in the wrong slot", () => {
    expect(codes(check({ ...human, origin: "caravaneer" }))).toContain("package");
  });

  it("rejects a missing choice answer", () => {
    expect(codes(check({ ...isek, choices: isek.choices!.slice(0, 1) }))).toEqual(["choice"]);
  });

  it("rejects the wrong number of choices", () => {
    const choices = [...isek.choices!.slice(0, 1), { package: "merchant-dynasty", from: "language", traits: [] }];
    expect(codes(check({ ...isek, choices }))).toEqual(["choice"]);
  });

  it("rejects an answer outside a resolvable pool", () => {
    const choices = [...isek.choices!.slice(0, 1), { package: "merchant-dynasty", from: "language", traits: ["haggler"] }];
    expect(codes(check({ ...isek, choices }))).toEqual(["choice"]);
  });

  it("takes any name for a Contact, since the player decides who it is", () => {
    const named = (traits: string[]) => isek.choices!.map((c) => (c.from === "contact" ? { ...c, traits } : c));
    const r = check({ ...isek, choices: named(["my cousin in the harbor guard"]) });
    expectLegal(r);
    expect(r.warnings).toEqual([]);
    // Contacts aren't Traits, so they don't show up as held Traits.
    expect(r.summary!.traits.map((h) => h.trait)).not.toContain("my cousin in the harbor guard");
    expect(codes(check({ ...isek, choices: named(["Oyl", "Wenna"]) }))).toEqual(["choice"]);
    expect(codes(check({ ...isek, choices: named(["Oyl", "Oyl"]) }))).toEqual(["choice", "choice"]);
  });

  it("reminds the player to record a Contact, without making the build illegal", () => {
    const reminder = expect.objectContaining({ code: "choice", message: "Caravaneer gives 1 Contact: record who on the Choices step" });
    const missing = check({ ...isek, choices: isek.choices!.filter((c) => c.from !== "contact") });
    expectLegal(missing);
    expect(missing.warnings).toEqual([reminder]);
    const empty = check({ ...isek, choices: isek.choices!.map((c) => (c.from === "contact" ? { ...c, traits: [] } : c)) });
    expectLegal(empty);
    expect(empty.warnings).toEqual([reminder]);
  });

  it("answers Dreftian-language choices from Dreftian languages only", () => {
    // No package offers this choice now that Dreft grants Dreftan, so a copy
    // of the Dreft Origin offers one here.
    const withChoice: Content = {
      ...content,
      packages: content.packages.map((p) =>
        p.id === "dreft" ? { ...p, grants: p.grants.filter((g) => g.trait !== "dreftan"), choices: [{ choose: 1, from: "dreftian-language" }] } : p,
      ),
    };
    const answer = (traits: string[]) => [...isek.choices!, { package: "dreft", from: "dreftian-language", traits }];
    expectLegal(check({ ...isek, choices: answer(["dreftan"]) }, withChoice));
    expect(codes(check({ ...isek, choices: answer(["english"]) }, withChoice))).toEqual(["choice"]);
    expect(codes(check({ ...isek, choices: answer(["old-herminstan"]) }, withChoice))).toEqual(["unknown-trait"]);
  });

  it("rejects an answer for a package the build doesn't have", () => {
    const r = check({ ...human, choices: [{ package: "caravaneer", from: "contact", traits: ["Old Friend"] }] });
    expect(codes(r)).toEqual(["choice"]);
  });
});

describe("rule 6: the Tetra Origin's language", () => {
  const tetra = { ...human, origin: "tetra", traits: [] };
  const answer = (traits: string[]) => ({ ...tetra, choices: [{ package: "tetra", from: "spoken-and-written-language", traits }] });

  it("grants Tetra and SDU law, and one language both spoken and written", () => {
    const r = check(answer(["english"]));
    expectLegal(r);
    const held = r.summary!.traits.map((h) => h.trait);
    expect(held).toEqual(expect.arrayContaining(["tetra", "sdu-law", "english", "english-written"]));
    expect(held).not.toContain("dreftan-written");
    expect(r.summary!.traits.find((h) => h.trait === "english-written")!.sources).toEqual(["origin tetra choice"]);
    expect(r.summary!.backgroundList).toEqual(expect.arrayContaining(["the-diplomatic-wing", "planar-exploration", "ark-life"]));
  });

  it("is answered with the spoken form only", () => {
    expect(codes(check(answer(["english-written"])))).toEqual(["choice"]);
    expect(codes(check(answer(["english", "dreftan"])))).toEqual(["choice"]);
    expect(codes(check(answer([])))).toEqual(["choice"]);
  });
});

describe("Conveyed Traits", () => {
  const soldier = {
    ...human,
    origin: "american-empire-earth",
    profession: "american-empire-soldier",
    traits: [],
  };

  it("come with a package, and an Earth soldier is legal", () => {
    const r = check(soldier);
    expectLegal(r);
    const held = r.summary!.traits.map((h) => h.trait);
    expect(held).toEqual(expect.arrayContaining(["imperial-service-record", "american-history", "imperial-law", "english", "english-written", "wielder-rifle"]));
  });

  it("can't be bought with a pick", () => {
    const r = check({ ...human, traits: [{ trait: "explorers-lodge-membership", pick: "universal" }] });
    expect(codes(r)).toEqual(["conveyed"]);
  });

  it("stay off the Background Trait list, even when a Kind's Trait access matches their tags", () => {
    // Isek get military Traits; the Conveyed Imperial Service Record is tagged military.
    const r = check({ ...isek, traits: [] });
    expect(r.summary!.backgroundList).not.toContain("imperial-service-record");
  });
});

describe("the Systems Origins", () => {
  it("lets the SDU take any one language, spoken and written", () => {
    const sdu = { ...human, origin: "sdu-colonies", traits: [], choices: [{ package: "sdu-colonies", from: "spoken-and-written-language", traits: ["mandarin"] }] };
    const r = check(sdu);
    expectLegal(r);
    expect(r.summary!.traits.map((h) => h.trait)).toEqual(expect.arrayContaining(["the-stellar-democratic-union", "sdu-law", "mandarin", "mandarin-written"]));
  });

  it("gives Kashgar, the Chinese Empire and the American colonies their own Background lists", () => {
    const list = (origin: string, choices: BuildInput["choices"] = []) => check({ ...human, origin, traits: [], choices }).summary!.backgroundList;
    expect(list("kashgar", [{ package: "kashgar", from: "spoken-and-written-language", traits: ["english"] }])).toEqual(expect.arrayContaining(["kashgar-mindworks", "robotics"]));
    expect(list("chinese-empire-colonies")).toEqual(expect.arrayContaining(["yutu", "zhulong"]));
    expect(list("american-empire-colonies")).toEqual(expect.arrayContaining(["new-columbia", "ark-new-york"]));
  });
});

describe("rule 6: Trait choices", () => {
  const language = { trait: "additional-language", pick: "universal" as const };
  const contact = { trait: "additional-contact", pick: "universal" as const };
  const withTraits = (...picks: BuildInput["traits"] & object) => ({ ...human, traits: [...human.traits!, ...picks] });

  it("asks a held Trait's choice, and holds the answer", () => {
    const unanswered = check(withTraits(language));
    expect(unanswered.errors).toEqual([
      expect.objectContaining({ code: "choice", message: `Additional Language asks for 1 from "language", but the build doesn't answer it` }),
    ]);
    expect(unanswered.summary!.questions).toEqual([
      { by: "trait", id: "additional-language", name: "Additional Language", from: "language", count: 1, notes: ["1 language per rank"] },
    ]);
    const r = check({ ...withTraits(language), choices: [{ trait: "additional-language", from: "language", traits: ["english"] }] });
    expectLegal(r);
    expect(r.summary!.traits.find((h) => h.trait === "english")!.sources).toEqual(["trait additional-language choice"]);
  });

  it("asks again for each rank of a ranked Trait", () => {
    // Dreft grants Dreftan, so the second language is a fixture.
    const build = withTraits(language, { ...language, rank: 2 });
    const answer = (traits: string[]) => check({ ...build, choices: [{ trait: "additional-language", from: "language", traits }] }, withFixtures);
    expect(codes(answer(["english"]))).toEqual(["choice"]);
    expectLegal(answer(["english", "fixture-trade-cant"]));
  });

  it("only reminds the player to record a Contact from a Trait", () => {
    const r = check(withTraits(contact));
    expectLegal(r);
    expect(r.warnings).toEqual([
      expect.objectContaining({ code: "choice", message: "Additional Contact gives 1 Contact: record who on the Choices step" }),
    ]);
    const named = check({ ...withTraits(contact), choices: [{ trait: "additional-contact", from: "contact", traits: ["Wenna the fence"] }] });
    expectLegal(named);
    expect(named.warnings).toEqual([]);
  });

  it("rejects a language the build already holds", () => {
    const r = check({ ...isek, traits: [...isek.traits!, language], choices: [...isek.choices!, { trait: "additional-language", from: "language", traits: ["dreftan"] }] });
    expect(codes(r)).toEqual(["duplicate-trait"]);
  });

  it("rejects an answer for a Trait the build doesn't hold", () => {
    const r = check({ ...human, choices: [{ trait: "additional-language", from: "language", traits: ["english"] }] });
    expect(r.errors).toEqual([
      expect.objectContaining({ code: "choice", message: "The build answers a choice for Additional Language, which it doesn't hold" }),
    ]);
  });

  it("rejects an answer that names both a package and a Trait", () => {
    const both = { package: "dreft", trait: "additional-language", from: "language", traits: ["english"] };
    expect(codes(check({ ...withTraits(language), choices: [both] }))).toEqual(["schema"]);
  });
});

describe("rule 7: the Background Trait list", () => {
  it("rejects a background pick on a Trait that isn't on the list", () => {
    const r = check({ ...human, traits: [{ trait: "tracker", pick: "background" }] });
    expect(codes(r)).toEqual(["pick-type"]);
  });

  it("includes the packages' backgroundTraits", () => {
    const packages = content.packages.map((p) =>
      p.id === "royal-guard" ? BackgroundPackage.parse({ ...p, backgroundTraits: ["tracker"] }) : p,
    );
    const r = check({ ...human, traits: [{ trait: "tracker", pick: "background" }] }, { ...content, packages });
    expectLegal(r);
  });

  it("includes Traits matching the Kind's traitAccess", () => {
    // Isek have military access; Shield Wall is tagged military.
    expectLegal(check({ ...isek, traits: [{ trait: "shield-wall", pick: "background" }] }));
    expect(codes(check({ ...orcoid, traits: [{ trait: "shield-wall", pick: "background" }] }))).toEqual(["pick-type"]);
  });

  it("rejects a universal pick on a Background Trait", () => {
    const r = check({ ...isek, traits: [{ trait: "fixture-heirloom-blade", pick: "universal" }] }, withFixtures);
    expect(codes(r)).toEqual(["pick-type"]);
  });

  it("rejects an unknown Trait", () => {
    expect(codes(check({ ...human, traits: [{ trait: "laser-eyes", pick: "universal" }] }))).toEqual(["unknown-trait"]);
  });
});

describe("rule 8: unspent picks are banked", () => {
  it("allows a build that spends nothing", () => {
    const r = check({ ...human, traits: [] });
    expectLegal(r);
    expect(r.summary!.picks.universal.banked).toBe(10);
  });

  it("rejects spending more universal picks than the stats give", () => {
    const universal = ["survivalist", "tracker", "farming", "streetwise", "concealment", "teamster",
      "tinkerer", "ambusher", "sleight-of-hand", "incantation", "herbalism"];
    const r = check({ ...human, traits: universal.map((trait) => ({ trait, pick: "universal" as const })) });
    expect(codes(r)).toEqual(["picks-overspent"]);
  });
});

describe("rule 9: creation-only allowances", () => {
  it("lets universal picks buy knowledge Traits", () => {
    expectLegal(check({ ...human, traits: [{ trait: "herbalism", pick: "universal" }] }));
  });

  it("allows starter-only Traits", () => {
    expectLegal(check({ ...isek, traits: [{ trait: "fixture-heirloom-blade", pick: "background" }] }, withFixtures));
  });

  it("still keeps starter-only Background Traits off universal picks", () => {
    const r = check({ ...human, traits: [{ trait: "fixture-heirloom-blade", pick: "universal" }] }, withFixtures);
    expect(codes(r)).toEqual(["pick-type"]);
  });
});

describe("rule 10: prerequisites and ranks", () => {
  it("rejects a Trait whose prerequisite isn't held", () => {
    const r = check({ ...human, traits: [{ trait: "fixture-master-tracker", pick: "universal" }] }, withFixtures);
    expect(codes(r)).toEqual(["prerequisite"]);
  });

  it("accepts a prerequisite from a pick or a package grant", () => {
    expectLegal(check(
      { ...human, traits: [{ trait: "tracker", pick: "universal" }, { trait: "fixture-master-tracker", pick: "universal" }] },
      withFixtures,
    ));
    // Guild Hunter grants Tracker.
    expectLegal(check(
      { ...orcoid, profession: "guild-hunter", traits: [{ trait: "fixture-master-tracker", pick: "universal" }],
        choices: [{ package: "guild-hunter", from: "contact", traits: ["Old Friend"] }] },
      withFixtures,
    ));
  });

  it("rejects taking a granted non-ranked Trait again", () => {
    // Royal Guard grants Vigilance.
    const r = check({ ...human, traits: [{ trait: "vigilance", pick: "universal" }] });
    expect(codes(r)).toEqual(["duplicate-trait"]);
  });

  it("rejects picking a non-ranked Trait twice", () => {
    const r = check({ ...human, traits: [{ trait: "tracker", pick: "universal" }, { trait: "tracker", pick: "universal" }] });
    expect(codes(r)).toEqual(["duplicate-trait"]);
  });

  it("rejects a non-ranked Trait above rank 1", () => {
    const r = check({ ...human, traits: [{ trait: "tracker", rank: 2, pick: "universal" }] });
    expect(codes(r)).toEqual(["rank"]);
  });

  it("rejects skipping a rank", () => {
    // Glintl grants Seafaring 1; rank 3 needs rank 2 first.
    const r = check({ ...human, traits: [{ trait: "seafaring", rank: 3, pick: "universal" }] });
    expect(codes(r)).toEqual(["rank"]);
  });

  it("rejects buying a rank already granted", () => {
    const r = check({ ...human, traits: [{ trait: "dreft", rank: 1, pick: "universal" }] });
    expect(codes(r)).toEqual(["rank"]);
  });

  const swordplay = [
    { trait: "fixture-swordplay", rank: 1, pick: "universal" as const },
    { trait: "fixture-swordplay", rank: 2, pick: "universal" as const },
  ];

  it("rejects ranking up without 3 × rank in each rank stat", () => {
    const r = check({ ...human, traits: swordplay }, withFixtures);
    expect(codes(r)).toEqual(["rank-stats"]);
    expect(r.errors[0]!.message).toContain("at least 6");
  });

  it("allows ranking up once the stats are there", () => {
    // Power 1 + 5 = 6 and grace 1 + 5 = 6 by level 4.
    const levels = [
      { group: "physical" as const, points: { power: 2, grace: 1 } },
      { group: "physical" as const, points: { power: 2, grace: 1 } },
      { group: "physical" as const, points: { power: 1, grace: 2 } },
      { group: "physical" as const, points: { grace: 1, endurance: 2 } },
    ];
    expectLegal(check({ ...human, level: 4, levels, traits: swordplay }, withFixtures, { startingLevel: 4 }));
  });
});

describe("rule 11: HP, VP and SP", () => {
  it("takes HP, VP and SP from the Physical, Social and Mental focus stats", () => {
    // Endurance 1, Power 2 and Grace 3 after a physical level 1; 1 in each other stat.
    expect(check(human).summary!.resources).toEqual({ hp: 16, vp: 3, sp: 3 });
    const r = check({ ...human, levels: [{ group: "mental", points: { logic: 3 } }] }).summary!;
    expect(r.resources).toEqual({ hp: 13, vp: 3, sp: 6 });
  });

  it("adds a Trait's resources once per rank held", () => {
    const boosted: Content = {
      ...content,
      traits: content.traits.map((t) =>
        t.id === "survivalist" ? { ...t, resources: { hp: 2 } } : t.id === "dreft" ? { ...t, resources: { sp: 1 } } : t,
      ),
    };
    expect(check(human, boosted).summary!.resources).toEqual({ hp: 18, vp: 3, sp: 5 });
  });
});
