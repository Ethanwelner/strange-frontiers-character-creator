import { describe, expect, it } from "vitest";
import { BackgroundPackage, Trait } from "../schema/index.js";
import { loadContent, type Content } from "./content.js";
import type { BuildInput } from "./build.js";
import { validateBuild, type IssueCode } from "./validate.js";

const loaded = loadContent();
const content = loaded.content;

// The real content has no Background, starter-only, prerequisite or
// rank-stat Traits yet, so the rules that need them are tested with these.
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
    id: "fixture-old-friend",
    name: "Old Friend",
    status: "placeholder",
    plane: "isekai",
    summary: "Test fixture: a Contact.",
    category: "contact",
    effect: "Test only.",
  }),
];
const withFixtures: Content = { ...content, traits: [...content.traits, ...fixtures] };

function check(build: BuildInput, c: Content = content, campaign?: { startingLevel: number }) {
  return validateBuild(build, c, campaign);
}

function codes(result: ReturnType<typeof check>): IssueCode[] {
  return result.errors.map((e) => e.code);
}

function expectLegal(result: ReturnType<typeof check>) {
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
}

// Legal sample characters, one per Kind (and per Tatot form).
const human: BuildInput = {
  name: "Harbor-born guard",
  kind: "human",
  origin: "glintl",
  profession: "royal-guard",
  past: "noble-household",
  levels: [{ group: "physical", points: { power: 1, grace: 2 } }],
  traits: [
    { trait: "survivalist", pick: "universal" },
    { trait: "tracker", pick: "universal" },
    { trait: "farming", pick: "universal" },
    { trait: "seafaring", rank: 2, pick: "universal" },
  ],
};

const isek: BuildInput = {
  name: "Isek caravan rider",
  kind: "isek",
  origin: "port-herminst",
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
    { package: "port-herminst", from: "dreftian-language", traits: ["old-herminstan"] },
    { package: "caravaneer", from: "contact", traits: ["harbor-master-oyl"] },
    { package: "merchant-dynasty", from: "language", traits: ["english"] },
  ],
};

// Once a Contact exists, the Isek's contact answer has to be a real one.
const isekWithFriend: BuildInput = {
  ...isek,
  choices: isek.choices!.map((c) => (c.from === "contact" ? { ...c, traits: ["fixture-old-friend"] } : c)),
};

const orcoid: BuildInput = {
  name: "Orcoid gate hand",
  kind: "tatot",
  form: "orcoid",
  origin: "corsine-mountains",
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
  kind: "tatot",
  form: "goblinoid",
  origin: "tetra",
  profession: "licensed-mage",
  past: "raised-in-the-caravan-town",
  levels: [{ group: "mental", points: { logic: 1, memory: 2 } }],
  traits: [
    { trait: "tinkerer", pick: "universal" },
    { trait: "the-switch-port", rank: 2, pick: "universal" },
    { trait: "herbalism", pick: "universal" },
  ],
};

const guwain: BuildInput = {
  name: "Guwain hedge witch",
  kind: "guwain",
  origin: "glintl",
  profession: "hedge-witch",
  past: "raised-in-the-caravan-town",
  levels: [{ group: "physical", points: { endurance: 2, power: 1 } }],
  traits: [
    { trait: "survivalist", pick: "universal" },
    { trait: "seafaring", rank: 2, pick: "universal" },
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
    expect(r.summary!.innerRing).toEqual({ physical: 1, social: 0, mental: 0 });
    expect(r.summary!.picks.universal).toEqual({ available: 10, spent: 4, banked: 6 });
    expect(r.summary!.picks.background).toEqual({ available: 2, spent: 0, banked: 2 });
  });

  it("Isek", () => {
    const r = check(isek);
    expectLegal(r);
    // Contact and Dreftian-language pools have no Traits yet.
    expect(r.warnings.map((w) => w.code)).toEqual(["choice-pool", "choice-pool"]);
    expect(r.summary!.picks.background).toEqual({ available: 3, spent: 3, banked: 0 });
    expect(r.summary!.backgroundList).toContain("shield-wall");
  });

  it("Tatot, orcoid", () => {
    const r = check(orcoid);
    expectLegal(r);
    expect(r.warnings).toEqual([]);
    expect(r.summary!.stats).toMatchObject({ power: 2, persuasion: 3, demeanor: 2 });
  });

  it("Tatot, goblinoid", () => {
    const r = check(goblinoid);
    expectLegal(r);
    expect(r.warnings).toEqual([]);
    expect(r.summary!.stats).toMatchObject({ power: 0, logic: 3, memory: 3 });
    expect(r.summary!.traits.find((t) => t.trait === "the-switch-port")!.rank).toBe(2);
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
    const r = validateBuild({ kind: "human" }, content);
    expect(r.ok).toBe(false);
    expect(new Set(codes(r))).toEqual(new Set(["schema"]));
    expect(r.summary).toBeUndefined();
  });
});

describe("rule 1: level 0 stats come from the Kind or form", () => {
  it("requires a form for a Kind with forms", () => {
    const { form: _, ...noForm } = orcoid;
    expect(codes(check(noForm))).toContain("form");
  });

  it("rejects an unknown form", () => {
    expect(codes(check({ ...orcoid, form: "hobgoblinoid" }))).toContain("form");
  });

  it("rejects a form for a Kind without forms", () => {
    expect(codes(check({ ...human, form: "orcoid" }))).toContain("form");
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

  it("rejects a level that doesn't match the campaign", () => {
    expect(codes(check(level3))).toEqual(["level"]);
  });

  it("needs one allocation per level", () => {
    expect(codes(check({ ...human, levels: [] }))).toContain("level");
  });
});

describe("rule 3: each level is 1 Inner Ring point and 3 Outer Ring points", () => {
  it("rejects the wrong number of Outer Ring points", () => {
    const r = check({ ...human, levels: [{ group: "physical", points: { power: 2, grace: 2 } }] });
    expect(codes(r)).toContain("allocation");
  });

  it("rejects points outside the level's group", () => {
    const r = check({ ...human, levels: [{ group: "physical", points: { power: 2, memory: 1 } }] });
    expect(codes(r)).toEqual(["allocation"]);
  });
});

describe("rule 4: stat maximums", () => {
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
    expect(held).toEqual(expect.arrayContaining(["mountaineering", "smooth-talker", "survivalist"]));
  });

  it("rejects a package in the wrong slot", () => {
    expect(codes(check({ ...human, origin: "caravaneer" }))).toContain("package");
  });

  it("rejects a missing choice answer", () => {
    expect(codes(check({ ...isek, choices: isek.choices!.slice(0, 2) }))).toEqual(["choice"]);
  });

  it("rejects the wrong number of choices", () => {
    const choices = [...isek.choices!.slice(0, 2), { package: "merchant-dynasty", from: "language", traits: [] }];
    expect(codes(check({ ...isek, choices }))).toEqual(["choice"]);
  });

  it("rejects an answer outside a resolvable pool", () => {
    const choices = [...isek.choices!.slice(0, 2), { package: "merchant-dynasty", from: "language", traits: ["haggler"] }];
    expect(codes(check({ ...isek, choices }))).toEqual(["choice"]);
  });

  it("checks contact answers once Contacts exist", () => {
    const bad = check(isek, withFixtures);
    expect(codes(bad)).toEqual(["unknown-trait"]);
    const good = check(isekWithFriend, withFixtures);
    expectLegal(good);
    expect(good.warnings.map((w) => w.code)).toEqual(["choice-pool"]);
  });

  it("rejects an answer for a package the build doesn't have", () => {
    const r = check({ ...human, choices: [{ package: "caravaneer", from: "contact", traits: ["fixture-old-friend"] }] });
    expect(codes(r)).toEqual(["choice"]);
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

  it("includes Traits matching the Kind's featAccess", () => {
    // Isek have military access; Shield Wall is tagged military.
    expectLegal(check({ ...isek, traits: [{ trait: "shield-wall", pick: "background" }] }));
    expect(codes(check({ ...orcoid, traits: [{ trait: "shield-wall", pick: "background" }] }))).toEqual(["pick-type"]);
  });

  it("rejects a universal pick on a Background Trait", () => {
    const r = check({ ...isekWithFriend, traits: [{ trait: "fixture-heirloom-blade", pick: "universal" }] }, withFixtures);
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
    expectLegal(check({ ...isekWithFriend, traits: [{ trait: "fixture-heirloom-blade", pick: "background" }] }, withFixtures));
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
        choices: [{ package: "guild-hunter", from: "contact", traits: ["fixture-old-friend"] }] },
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
    const r = check({ ...human, traits: [{ trait: "seafaring", rank: 1, pick: "universal" }] });
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
