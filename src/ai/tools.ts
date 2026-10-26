// The tools Claude uses to build a character. Each handler reads the real
// content and asks the real engine; none of them re-implements a rule.
import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_CAMPAIGN, type Campaign } from "../engine/build.js";
import type { Content } from "../engine/parse.js";
import { choicePool, FREE_TEXT_POOLS, isFreeTextPool, validateBuild } from "../engine/validate.js";
import { PackageType, StatId, TraitCategory, type Trait } from "../schema/index.js";
import type { BuildCheck, IdIssue, OpenChoice } from "./types.js";

type Tool = Anthropic.Beta.BetaTool;

const CONCEPT_SCHEMA = {
  type: "object",
  description: "Who the character is. The rules engine turns this into a full legal build. Every id must come from the game's content.",
  properties: {
    name: { type: "string", description: "The character's name, if the player gave one or one fits." },
    kind: { type: "string", description: "Kind id, e.g. isek." },
    origin: { type: "string", description: "Origin package id." },
    profession: { type: "string", description: "Profession package id." },
    past: { type: "string", description: "Past package id." },
    focus: {
      type: "array",
      items: { type: "string", enum: StatId.options },
      description: "The stats that matter most for this character, most important first (two to four). Stat points go to these.",
    },
    magic: {
      type: "integer",
      minimum: 0,
      description:
        "How many of the character's levels go to the Magic core stat, for a spellcaster or anyone magical. Only Kinds or packages that " +
        "grant a Trait opening Magic (Magical Heritage, for every Kind of Dreft but the Orcoid Tatot) can use it. Each Magic level gives 3 MP but no focus points. Default 0.",
    },
    traits: {
      type: "array",
      items: { type: "string" },
      description:
        "Trait ids that fit the character, best fit first. List more than the picks will cover (12 to 20): the engine buys them in order " +
        "and skips any the build can't take. List a ranked Trait twice to ask for rank 2. Don't list Traits the packages already grant.",
    },
    choices: {
      type: "array",
      description:
        "Optional answers to package or Trait choices with a pool, like languages (an Additional Language Trait asks which one). " +
        "Any you leave out are filled in. Never answer Contacts.",
      items: {
        type: "object",
        properties: {
          package: { type: "string", description: "The package that asks. Give this or trait, not both." },
          trait: { type: "string", description: "The Trait that asks, for a Trait's choice." },
          from: { type: "string", description: "The pool name, as the package or Trait lists it." },
          traits: { type: "array", items: { type: "string" } },
        },
        required: ["from", "traits"],
      },
    },
  },
  required: ["kind", "origin", "profession", "past", "focus", "traits"],
} as const;

export const TOOLS: Tool[] = [
  {
    name: "search_traits",
    description:
      "Search the game's Traits by words in their name, summary or tags, and filter by category, tag and pick type. " +
      "Call this to find Traits that fit the concept before picking them. For background picks, pass pick: \"background\" " +
      "with the build's kind, origin, profession and past: only Traits on that build's Background Trait list come back.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for, e.g. \"sea trade\". Leave out to list everything that passes the filters." },
        category: { type: "string", enum: TraitCategory.options },
        tags: { type: "array", items: { type: "string" }, description: "Only Traits with at least one of these tags." },
        pick: { type: "string", enum: ["universal", "background"], description: "Only Traits this kind of pick can buy." },
        kind: { type: "string" },
        origin: { type: "string" },
        profession: { type: "string" },
        past: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Most results to return. Default 25." },
      },
    },
  },
  {
    name: "list_packages",
    description: "List the background packages of one type (origin, profession or past), with their summaries and tags.",
    input_schema: {
      type: "object",
      properties: { type: { type: "string", enum: PackageType.options } },
      required: ["type"],
    },
  },
  {
    name: "get_package",
    description:
      "Get one background package in full: the Traits it grants, the choices it asks for (and whether their pools have Traits yet), " +
      "and the Traits it adds to the Background Trait list. Choices marked leftForPlayer (like Contacts) are for the player to fill in.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "get_kind",
    description: "Get one Kind in full: its features, Trait access, and starting stats and maximums.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "submit_build",
    description:
      "Submit the character concept with a one-line reason for each choice. The rules engine spreads the stat points, buys Traits from " +
      "your list in order and checks the result. If it's legal you're done; if not, the problems come back and you submit again.",
    input_schema: {
      type: "object",
      properties: {
        concept: CONCEPT_SCHEMA,
        summary: { type: "string", description: "One or two sentences on who this character is, for the player." },
        reasons: {
          type: "array",
          description:
            "One short line per choice. Targets: kind, origin, profession, past, levels (why the priority stats), " +
            "and each listed Trait's id.",
          items: {
            type: "object",
            properties: { target: { type: "string" }, reason: { type: "string" } },
            required: ["target", "reason"],
          },
        },
      },
      required: ["concept", "summary", "reasons"],
    },
  },
];

const PLACEHOLDER = "player-choice";

const obj = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// A choice Claude leaves to the player: a free-text pool like Contacts or
// Places, which the player writes in, or a pool with no Traits in content yet.
const leftForPlayer = (from: string, content: Content) => isFreeTextPool(from) || choicePool(from, content).length === 0;

// Whether a choice answer and an open choice belong to the same package or Trait.
const sameAsker = (a: Record<string, unknown> | undefined, o: OpenChoice) =>
  !!a && a.from === o.from && (o.package !== undefined ? a.package === o.package : a.trait === o.trait);

// The choices in the build's packages and held Traits that Claude leaves to
// the player.
export function openChoices(build: unknown, content: Content): OpenChoice[] {
  const b = obj(build) ?? {};
  const summary = validateBuild(b, content).summary;
  if (summary) {
    return summary.questions
      .filter((q) => leftForPlayer(q.from, content))
      .map((q) => ({ [q.by]: q.id, from: q.from, count: q.count, ...(q.notes.length ? { note: q.notes.join("; ") } : {}) }));
  }
  // A build that isn't shaped like one yet: its packages' choices only.
  const out: OpenChoice[] = [];
  for (const slot of ["origin", "profession", "past"]) {
    const pkg = content.packages.find((p) => p.id === b[slot] && p.type === slot);
    for (const c of pkg?.choices ?? []) {
      if (!leftForPlayer(c.from, content)) continue;
      const open = out.find((o) => o.package === pkg!.id && o.from === c.from);
      if (open) open.count += c.choose;
      else out.push({ package: pkg!.id, from: c.from, count: c.choose, note: c.note });
    }
  }
  return out;
}

// Every id in the build must exist in content. The engine already rejects
// most unknown ids, but only warns about answers to pools it can't check, so
// this catches those too. Choices left to the player can't be answered.
export function unknownIds(build: unknown, content: Content): IdIssue[] {
  const b = obj(build);
  if (!b) return [];
  const issues: IdIssue[] = [];
  const traitIds = new Set(content.traits.map((t) => t.id));
  const packageIds = new Set(content.packages.map((p) => p.id));
  const isText = (v: unknown): v is string => typeof v === "string";

  const kind = isText(b.kind) ? content.kinds.find((k) => k.id === b.kind) : undefined;
  if (isText(b.kind) && !kind) issues.push({ path: "kind", message: `Kind "${b.kind}" doesn't exist` });
  for (const slot of ["origin", "profession", "past"]) {
    if (isText(b[slot]) && !packageIds.has(b[slot])) issues.push({ path: slot, message: `Package "${b[slot]}" doesn't exist` });
  }
  list(b.traits).forEach((p, i) => {
    const id = obj(p)?.trait;
    if (isText(id) && !traitIds.has(id)) issues.push({ path: `traits[${i}]`, message: `Trait "${id}" doesn't exist` });
  });
  const open = openChoices(b, content);
  list(b.choices).forEach((a, i) => {
    const answer = obj(a);
    if (!answer) return;
    if (isText(answer.package) && !packageIds.has(answer.package)) {
      issues.push({ path: `choices[${i}]`, message: `Package "${answer.package}" doesn't exist` });
    }
    if (isText(answer.trait) && !traitIds.has(answer.trait)) {
      issues.push({ path: `choices[${i}]`, message: `Trait "${answer.trait}" doesn't exist` });
    }
    if (open.some((o) => sameAsker(answer, o))) {
      const noun = FREE_TEXT_POOLS[String(answer.from)];
      issues.push({
        path: `choices[${i}]`,
        message: noun
          ? `The player writes in their own ${noun} on the Choices step, so leave this choice out. Remove this answer.`
          : `No Traits exist in the "${String(answer.from)}" pool yet, so this choice is left for the player. Remove this answer.`,
      });
      return;
    }
    for (const id of list(answer.traits)) {
      if (isText(id) && !traitIds.has(id)) issues.push({ path: `choices[${i}]`, message: `Trait "${id}" doesn't exist` });
    }
  });
  return issues;
}

// Checks a proposed build: unknown ids first, then validateBuild. Choices left
// for the player from pools with no content are filled with placeholders for
// the engine, so they don't count against the build (an unrecorded Contact is
// only a warning anyway); `legal` reports the build exactly as proposed.
export function checkBuild(build: unknown, content: Content, campaign: Campaign = DEFAULT_CAMPAIGN): BuildCheck {
  const ids = unknownIds(build, content);
  const strict = validateBuild(build, content, campaign);
  const open = openChoices(build, content);
  const b = obj(build);
  let result = strict;
  let placeholderPaths = new Set<string>();
  if (b && open.some((o) => !isFreeTextPool(o.from))) {
    const choices = list(b.choices);
    const answered = (o: OpenChoice) => choices.some((a) => sameAsker(obj(a), o));
    const filled = open.filter((o) => !answered(o) && !isFreeTextPool(o.from)).map((o) => ({
      ...(o.package !== undefined ? { package: o.package } : { trait: o.trait }),
      from: o.from,
      traits: Array.from({ length: o.count }, (_, i) => `${PLACEHOLDER}-${i + 1}`),
    }));
    placeholderPaths = new Set(filled.map((_, i) => `choices[${choices.length + i}]`));
    result = validateBuild({ ...b, choices: [...choices, ...filled] }, content, campaign);
  }
  return {
    accepted: ids.length === 0 && result.ok,
    legal: ids.length === 0 && strict.ok,
    unknownIds: ids,
    errors: result.errors,
    warnings: result.warnings.filter((w) => !w.path || !placeholderPaths.has(w.path)),
    openChoices: open,
    summary: result.summary,
  };
}

const traitInfo = (t: Trait) => ({
  id: t.id,
  name: t.name,
  category: t.category,
  summary: t.summary,
  tags: t.tags,
  types: t.types,
  ranked: t.ranked,
  rankStats: t.rankStats,
  prerequisites: t.prerequisites,
  background: t.background,
  starterOnly: t.starterOnly,
  conveyed: t.conveyed,
  choices: t.choices,
  // The Trait list it's on (only a character holding an opener can take it), and the lists it opens
  ...(t.list ? { list: t.list } : {}),
  ...(t.opensLists.length ? { opensLists: t.opensLists } : {}),
});

export class ToolError extends Error {}

const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

function searchTraits(input: Record<string, unknown>, content: Content, campaign: Campaign) {
  let traits = content.traits;
  const category = text(input.category);
  if (category) traits = traits.filter((t) => t.category === category);
  const tags = list(input.tags).filter((t): t is string => typeof t === "string");
  if (tags.length) traits = traits.filter((t) => t.tags.some((tag) => tags.includes(tag)));

  const pick = text(input.pick);
  if (pick) traits = traits.filter((t) => !t.conveyed);
  if (pick === "universal") traits = traits.filter((t) => !t.background);
  if (pick === "background") {
    const probe = {
      kind: input.kind,
      origin: input.origin,
      profession: input.profession,
      past: input.past,
      level: campaign.startingLevel,
      levels: [],
    };
    const ids = unknownIds(probe, content);
    if (ids.length) throw new ToolError(ids.map((i) => i.message).join("; "));
    const list = validateBuild(probe, content, campaign).summary?.backgroundList;
    if (!list) throw new ToolError("For background picks, pass the build's kind, origin, profession and past.");
    traits = traits.filter((t) => list.includes(t.id));
  }

  const words = (text(input.query) ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const scored = traits.map((t) => {
    const hay = [t.id, t.name, t.summary, t.category, ...t.tags, ...t.types].join(" ").toLowerCase();
    return { t, score: words.filter((w) => hay.includes(w)).length };
  });
  const limit = typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 100) : 25;
  const hits = scored
    .filter((s) => words.length === 0 || s.score > 0)
    .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name))
    .slice(0, limit);
  return { count: hits.length, traits: hits.map((h) => traitInfo(h.t)) };
}

function getPackage(input: Record<string, unknown>, content: Content) {
  const id = text(input.id);
  const pkg = content.packages.find((p) => p.id === id);
  if (!pkg) throw new ToolError(`No package "${id}". Known ids: ${content.packages.map((p) => p.id).join(", ")}`);
  const name = (traitId: string) => content.traits.find((t) => t.id === traitId)?.name ?? traitId;
  return {
    ...pkg,
    grants: pkg.grants.map((g) => ({ ...g, name: name(g.trait) })),
    choices: pkg.choices.map((c) =>
      leftForPlayer(c.from, content)
        ? { ...c, leftForPlayer: true }
        : { ...c, pool: choicePool(c.from, content).map((t) => ({ id: t.id, name: t.name })) },
    ),
    backgroundTraits: pkg.backgroundTraits.map((t) => ({ id: t, name: name(t) })),
  };
}

function getKind(input: Record<string, unknown>, content: Content) {
  const id = text(input.id);
  const kind = content.kinds.find((k) => k.id === id);
  if (!kind) throw new ToolError(`No Kind "${id}". Known ids: ${content.kinds.map((k) => k.id).join(", ")}`);
  return kind;
}

// Runs one tool call. Throws ToolError for bad input, which the loop sends
// back to Claude as an error result. submit_build is handled by the loop.
export function runTool(name: string, rawInput: unknown, content: Content, campaign: Campaign = DEFAULT_CAMPAIGN): unknown {
  const input = obj(rawInput) ?? {};
  switch (name) {
    case "search_traits":
      return searchTraits(input, content, campaign);
    case "list_packages": {
      const type = PackageType.safeParse(input.type);
      if (!type.success) throw new ToolError(`type must be one of ${PackageType.options.join(", ")}`);
      return content.packages
        .filter((p) => p.type === type.data)
        .map((p) => ({ id: p.id, name: p.name, summary: p.summary, tags: p.tags, region: p.region }));
    }
    case "get_package":
      return getPackage(input, content);
    case "get_kind":
      return getKind(input, content);
    default:
      throw new ToolError(`Unknown tool "${name}"`);
  }
}
