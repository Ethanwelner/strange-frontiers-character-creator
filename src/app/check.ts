// Everything the UI knows about legality comes from validateBuild. These
// helpers only ask it questions; none of them re-implement a rule.
import type { Campaign, PickKind, StatGroup } from "../engine/build.js";
import type { Content } from "../engine/parse.js";
import { coreAccessOf, FOCUS_POINTS_PER_LEVEL, validateBuild, type BuildResult, type Issue } from "../engine/validate.js";
import { STAT_GROUPS, type Trait } from "../schema/index.js";
import { addPick, poolToLevels, toBuild, type Draft, type Step } from "./draft.js";

const LEVEL_PATH = /^levels\[(\d+)\]/;

// The core stats to show for a draft: Physical, Social and Mental, plus any
// the build can level (Magic, for most Kinds of Dreft) or already has points in,
// so the player can take back points a new Kind can't hold. Before the build
// checks out, the Kind's and packages' grants and the picks stand in.
export function coreStatsShown(draft: Draft, content: Content, result?: BuildResult): StatGroup[] {
  const open = coreAccessFor(draft, content, result);
  return (Object.keys(STAT_GROUPS) as StatGroup[]).filter((g) => open.includes(g) || draft.core[g] > 0);
}

// The core stats a draft can level, from the check if it has one.
export function coreAccessFor(draft: Draft, content: Content, result?: BuildResult): StatGroup[] {
  if (result?.summary) return result.summary.coreAccess;
  const held = [
    ...(content.kinds.find((k) => k.id === draft.kind)?.grants ?? []).map((g) => g.trait),
    ...content.packages.filter((p) => [draft.origin, draft.profession, draft.past].includes(p.id)).flatMap((p) => p.grants.map((g) => g.trait)),
    ...draft.traits.map((t) => t.trait),
  ];
  return coreAccessOf(held, content);
}

export function check(draft: Draft, content: Content, campaign: Campaign): BuildResult {
  const result = validateBuild(toBuild(draft), content, campaign);
  return { ...result, errors: poolErrors(result.errors, draft) };
}

// The engine checks one allocation per level; the builder spends stats as a
// pool. Its level errors are said in pool terms instead, one per group.
function poolErrors(errors: Issue[], draft: Draft): Issue[] {
  const levels = poolToLevels(draft.core, draft.points);
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const e of errors) {
    if (e.code === "level" && e.path === "levels") {
      const placed = Object.values(draft.core).reduce((n, k) => n + k, 0);
      const left = draft.level - placed;
      const n = Math.abs(left);
      out.push({
        ...e,
        message:
          left > 0
            ? `Place ${n} more core ${n === 1 ? "point" : "points"}`
            : `Take back ${n} core ${n === 1 ? "point" : "points"}; a level ${draft.level} character has ${draft.level}`,
      });
      continue;
    }
    const at = e.code === "allocation" ? LEVEL_PATH.exec(e.path ?? "") : null;
    const group = at ? levels[Number(at[1])]?.group : undefined;
    if (!group) {
      out.push(e);
      continue;
    }
    if (seen.has(group)) continue;
    seen.add(group);
    const room = draft.core[group] * FOCUS_POINTS_PER_LEVEL;
    const spent = STAT_GROUPS[group].reduce((n, s) => n + (draft.points[s] ?? 0), 0);
    const n = Math.abs(room - spent);
    const name = group.charAt(0).toUpperCase() + group.slice(1);
    out.push({
      ...e,
      path: "levels",
      message:
        spent < room
          ? `Place ${n} more ${name} ${n === 1 ? "point" : "points"}`
          : `${name} has ${n} more ${n === 1 ? "point" : "points"} than its core stat unlocks`,
    });
  }
  return out;
}

export interface TraitOption {
  trait: Trait;
  // The rank this pick would buy.
  rank: number;
  // Why the engine would reject it. Empty when the pick is legal.
  reasons: string[];
}

// The Traits a pick of this type could go on, each tried against the engine.
// A Trait is left out when the engine says it needs the other kind of pick;
// it's kept but given reasons when the engine rejects it for anything else.
// A Trait's own choices, like which language an Additional Language is, are
// answered on the Choices step afterward, so they don't count against it.
// Undefined until the build is complete enough for the engine to check.
export function traitOptions(draft: Draft, content: Content, campaign: Campaign, pick: PickKind): TraitOption[] | undefined {
  const base = check(draft, content, campaign);
  if (!base.summary) return undefined;
  const before = new Set(base.errors.map((e) => e.message));
  const held = new Map(base.summary.traits.map((h) => [h.trait, h.rank]));
  const options: TraitOption[] = [];
  for (const trait of content.traits) {
    // Non-ranked Traits are only ever bought at rank 1; the engine explains a duplicate.
    const rank = trait.ranked ? (held.get(trait.id) ?? 0) + 1 : 1;
    const trial = check(addPick(draft, trait.id, rank, pick), content, campaign);
    const ownChoice = `${trait.name} asks for `;
    const added = trial.errors.filter((e) => !before.has(e.message) && !(e.code === "choice" && e.message.startsWith(ownChoice)));
    // A Conveyed Trait can't be picked at all, and the wrong kind of pick is the other tab's.
    if (added.some((e) => e.code === "pick-type" || e.code === "conveyed")) continue;
    options.push({ trait, rank, reasons: added.map((e) => e.message) });
  }
  return options;
}

// Which step of the builder an engine issue belongs to.
export function stepOf(issue: Issue): Step {
  switch (issue.code) {
    case "kind":
      return "character";
    case "package":
      return "background";
    case "level":
      // The starting level is set on the Character step; the allocations are Stats'.
      return issue.path === "level" ? "character" : "stats";
    case "allocation":
    case "core-access":
    case "stat-max":
    case "stat-cap":
      return "stats";
    case "choice":
    case "choice-pool":
      return "choices";
    case "schema": {
      const field = issue.path?.split(".")[0];
      if (field === "name" || field === "level" || field === "kind") return "character";
      if (field === "origin" || field === "profession" || field === "past") return "background";
      if (field === "levels" || field === "startPoints") return "stats";
      if (field === "choices") return "choices";
      return "traits";
    }
    default:
      return issue.path === "choices" || issue.path?.startsWith("choices[") ? "choices" : "traits";
  }
}

const MISSING: Record<string, string> = {
  kind: "Choose a Kind",
  origin: "Choose an Origin",
  profession: "Choose a Profession",
  past: "Choose a Past",
};

// Schema errors for a field that hasn't been picked yet read as "expected
// string, received undefined"; say what to do instead.
export function describe(issue: Issue, draft: Draft): string {
  if (issue.code === "schema" && issue.path && issue.path in MISSING && !draft[issue.path as keyof Draft]) {
    return MISSING[issue.path]!;
  }
  return issue.message;
}
