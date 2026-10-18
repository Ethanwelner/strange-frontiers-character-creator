// The tools Claude uses to build a character. Each handler reads the real
// content and asks the real engine; none of them re-implements a rule.
import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_CAMPAIGN, type Campaign } from "../engine/build.js";
import type { Content } from "../engine/parse.js";
import { choicePool, validateBuild } from "../engine/validate.js";
import { PackageType, TraitCategory, type Trait } from "../schema/index.js";
import type { BuildCheck, IdIssue, OpenChoice } from "./types.js";

type Tool = Anthropic.Beta.BetaTool;

const BUILD_SCHEMA = {
  type: "object",
  description: "A character build. Every id must come from the game's content.",
  properties: {
    name: { type: "string", description: "The character's name, if the player gave one or one fits." },
    kind: { type: "string", description: "Kind id, e.g. isek." },
    form: { type: "string", description: "Form id. Required for a Kind with forms (the Tatot: orcoid or goblinoid); leave out otherwise." },
    origin: { type: "string", description: "Origin package id." },
    profession: { type: "string", description: "Profession package id." },
    past: { type: "string", description: "Past package id." },
    level: { type: "integer", description: "The campaign's starting level." },
    levels: {
      type: "array",
      description: "One entry per level, starting with level 1.",
      items: {
        type: "object",
        properties: {
          group: { type: "string", enum: ["physical", "social", "mental"], description: "Where this level's Inner Ring point goes." },
          points: {
            type: "object",
            description: "Exactly 3 Outer Ring points spread among the group's stats, e.g. {\"power\": 2, \"grace\": 1}.",
            additionalProperties: { type: "integer", minimum: 0 },
          },
        },
        required: ["group", "points"],
      },
    },
    traits: {
      type: "array",
      description: "Feat picks. Each entry buys one rank; a ranked Trait taken to rank 2 is two entries, ranks 1 and 2.",
      items: {
        type: "object",
        properties: {
          trait: { type: "string", description: "Trait id." },
          rank: { type: "integer", minimum: 1 },
          pick: { type: "string", enum: ["universal", "background"] },
        },
        required: ["trait", "rank", "pick"],
      },
    },
    choices: {
      type: "array",
      description: "Answers to the packages' choices whose pools have Traits in them. Leave out choices whose pool is empty.",
      items: {
        type: "object",
        properties: {
          package: { type: "string" },
          from: { type: "string", description: "The pool name, as the package lists it." },
          traits: { type: "array", items: { type: "string" } },
        },
        required: ["package", "from", "traits"],
      },
    },
  },
  required: ["kind", "origin", "profession", "past", "level", "levels", "traits", "choices"],
} as const;

export const TOOLS: Tool[] = [
  {
    name: "search_traits",
    description:
      "Search the game's Traits by words in their name, summary or tags, and filter by category, tag and pick type. " +
      "Call this to find Traits that fit the concept before picking them. For background picks, pass pick: \"background\" " +
      "with the build's kind (and form), origin, profession and past: only Traits on that build's Background Trait list come back.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for, e.g. \"sea trade\". Leave out to list everything that passes the filters." },
        category: { type: "string", enum: TraitCategory.options },
        tags: { type: "array", items: { type: "string" }, description: "Only Traits with at least one of these tags." },
        pick: { type: "string", enum: ["universal", "background"], description: "Only Traits this kind of pick can buy." },
        kind: { type: "string" },
        form: { type: "string" },
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
      "and the Traits it adds to the Background Trait list.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "get_kind",
    description: "Get one Kind in full: its features, feat access, and starting stats and maximums (per form, for a Kind with forms).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "validate_build",
    description:
      "Check a draft build with the rules engine. Returns unknown ids, errors, warnings, the resulting stats, how many universal and " +
      "background picks the stats give and how many are spent, the Traits held, the Background Trait list, and choices left for the player. " +
      "Call it as often as you like while drafting.",
    input_schema: {
      type: "object",
      properties: { build: BUILD_SCHEMA },
      required: ["build"],
    },
  },
  {
    name: "submit_build",
    description:
      "Submit the finished build with a one-line reason for each choice. The build is checked again: if the engine rejects it, " +
      "the errors come back and you fix them and submit again. Call this once the build passes validate_build.",
    input_schema: {
      type: "object",
      properties: {
        build: BUILD_SCHEMA,
        summary: { type: "string", description: "One or two sentences on who this character is, for the player." },
        reasons: {
          type: "array",
          description:
            "One short line per choice. Targets: kind, form (for a Kind with forms), origin, profession, past, levels, " +
            "each picked Trait's id, and choice:<package>/<pool> for each answered choice.",
          items: {
            type: "object",
            properties: { target: { type: "string" }, reason: { type: "string" } },
            required: ["target", "reason"],
          },
        },
      },
      required: ["build", "summary", "reasons"],
    },
  },
];

const PLACEHOLDER = "player-choice";

const obj = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// Choices in the build's packages that the engine can't check because their
// pool is empty. Claude leaves these for the player.
export function openChoices(build: unknown, content: Content): OpenChoice[] {
  const b = obj(build) ?? {};
  const out: OpenChoice[] = [];
  for (const slot of ["origin", "profession", "past"]) {
    const pkg = content.packages.find((p) => p.id === b[slot] && p.type === slot);
    for (const c of pkg?.choices ?? []) {
      if (choicePool(c.from, content).length > 0) continue;
      const open = out.find((o) => o.package === pkg!.id && o.from === c.from);
      if (open) open.count += c.choose;
      else out.push({ package: pkg!.id, from: c.from, count: c.choose, note: c.note });
    }
  }
  return out;
}

// Every id in the build must exist in content. The engine already rejects
// most unknown ids, but only warns about answers to pools it can't check, so
// this catches those too.
export function unknownIds(build: unknown, content: Content): IdIssue[] {
  const b = obj(build);
  if (!b) return [];
  const issues: IdIssue[] = [];
  const traitIds = new Set(content.traits.map((t) => t.id));
  const packageIds = new Set(content.packages.map((p) => p.id));
  const isText = (v: unknown): v is string => typeof v === "string";

  const kind = isText(b.kind) ? content.kinds.find((k) => k.id === b.kind) : undefined;
  if (isText(b.kind) && !kind) issues.push({ path: "kind", message: `Kind "${b.kind}" doesn't exist` });
  if (kind && isText(b.form) && !kind.forms?.some((f) => f.id === b.form)) {
    issues.push({ path: "form", message: `${kind.name} has no form "${b.form}"` });
  }
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
    if (open.some((o) => o.package === answer.package && o.from === answer.from)) {
      issues.push({
        path: `choices[${i}]`,
        message: `No Traits exist in the "${String(answer.from)}" pool yet, so this choice is left for the player. Remove this answer.`,
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
// for the player are filled with placeholders for the engine, so they don't
// count against the build; `legal` reports the build exactly as proposed.
export function checkBuild(build: unknown, content: Content, campaign: Campaign = DEFAULT_CAMPAIGN): BuildCheck {
  const ids = unknownIds(build, content);
  const strict = validateBuild(build, content, campaign);
  const open = openChoices(build, content);
  const b = obj(build);
  let result = strict;
  let placeholderPaths = new Set<string>();
  if (b && open.length > 0) {
    const choices = list(b.choices);
    const answered = (o: OpenChoice) => choices.some((a) => obj(a)?.package === o.package && obj(a)?.from === o.from);
    const filled = open.filter((o) => !answered(o)).map((o) => ({
      package: o.package,
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
  if (pick === "universal") traits = traits.filter((t) => !t.background);
  if (pick === "background") {
    const probe = {
      kind: input.kind,
      form: input.form,
      origin: input.origin,
      profession: input.profession,
      past: input.past,
      level: campaign.startingLevel,
      levels: [],
    };
    const ids = unknownIds(probe, content);
    if (ids.length) throw new ToolError(ids.map((i) => i.message).join("; "));
    const list = validateBuild(probe, content, campaign).summary?.backgroundList;
    if (!list) throw new ToolError("For background picks, pass the build's kind (and form), origin, profession and past.");
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
    choices: pkg.choices.map((c) => {
      const pool = choicePool(c.from, content);
      return pool.length
        ? { ...c, pool: pool.map((t) => ({ id: t.id, name: t.name })) }
        : { ...c, pool: [], leftForPlayer: true };
    }),
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
    case "validate_build":
      return checkBuild(input.build, content, campaign);
    default:
      throw new ToolError(`Unknown tool "${name}"`);
  }
}
