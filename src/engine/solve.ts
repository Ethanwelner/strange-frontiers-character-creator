// Turns a character concept into a full build. The concept says who the
// character is: Kind, packages, which stats matter most, and the Traits that
// fit, best first. The solver does the bookkeeping the model shouldn't: it
// spreads each level's stat points, answers package choices it can resolve,
// and buys Traits from the list in order, asking validateBuild about each one
// and skipping any the engine rejects. Deterministic and browser-safe.
import { z } from "zod";
import { STAT_CAP, STAT_GROUPS, StatId, type StatBlock, type Trait } from "../schema/index.js";
import { Build, ChoiceAnswer, DEFAULT_CAMPAIGN, type Campaign, type LevelAllocation, type PickKind, type StatGroup } from "./build.js";
import type { Content } from "./content.js";
import { choicePool, isFreeTextPool, OUTER_POINTS_PER_LEVEL, validateBuild, type BuildResult } from "./validate.js";

export const Concept = z.object({
  name: z.string().optional(),
  kind: z.string(),
  form: z.string().optional(),
  origin: z.string(),
  profession: z.string(),
  past: z.string(),
  // Outer Ring stats, most important first. Levels go to the groups these
  // stats are in, in this order, and points go to these stats first.
  focus: z.array(z.string()).default([]),
  // Trait ids, best fit first. Listing a ranked Trait twice asks for rank 2.
  traits: z.array(z.string()).default([]),
  // Answers to package choices the engine can check, like languages.
  choices: z.array(ChoiceAnswer).default([]),
});
export type Concept = z.infer<typeof Concept>;
export type ConceptInput = z.input<typeof Concept>;

export interface SkippedTrait {
  trait: string;
  reason: string;
}

export interface Solution {
  build: Build;
  // Trait ids from the list the solver bought, in order (repeats are ranks).
  taken: string[];
  // Background Trait list entries the solver added to spend leftover
  // background picks.
  filled: string[];
  skipped: SkippedTrait[];
  // validateBuild on the finished build, with open choices set aside.
  result: BuildResult;
}

const GROUP_OF = Object.fromEntries(
  Object.entries(STAT_GROUPS).flatMap(([group, stats]) => stats.map((s) => [s, group])),
) as Record<StatId, StatGroup>;

const isStat = (s: string): s is StatId => StatId.safeParse(s).success;

function baseStats(concept: Concept, content: Content): StatBlock | undefined {
  const kind = content.kinds.find((k) => k.id === concept.kind);
  return kind?.forms ? kind.forms.find((f) => f.id === concept.form)?.stats : kind?.stats;
}

// One allocation per level. Each level goes to the next group in focus order,
// and its points go to that group's focus stats in turn, then to whichever of
// its stats has the most room. A group with no room left is passed over.
export function allocateLevels(focusIn: string[], base: StatBlock | undefined, level: number): LevelAllocation[] {
  const focus = [...new Set(focusIn.filter(isStat))];
  const current = Object.fromEntries(StatId.options.map((s) => [s, base?.[s]?.start ?? 0])) as Record<StatId, number>;
  const max = (s: StatId) => Math.min(base?.[s]?.max ?? STAT_CAP, STAT_CAP);
  const room = (s: StatId) => max(s) - current[s];

  // Groups in focus order, then the rest by how much room they have.
  const unfocused = (Object.keys(STAT_GROUPS) as StatGroup[])
    .filter((g) => !focus.some((s) => GROUP_OF[s] === g))
    .sort((a, b) => STAT_GROUPS[b].reduce((n, s) => n + room(s), 0) - STAT_GROUPS[a].reduce((n, s) => n + room(s), 0));
  const groups = [...new Set(focus.map((s) => GROUP_OF[s]))];
  const order = groups.length ? groups : unfocused;
  const groupRoom = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + room(s), 0);

  const levels: LevelAllocation[] = [];
  for (let i = 0; i < level; i++) {
    const preferred = order[i % order.length]!;
    const group = [preferred, ...order, ...unfocused].find((g) => groupRoom(g) >= OUTER_POINTS_PER_LEVEL) ?? preferred;
    const focused = focus.filter((s) => GROUP_OF[s] === group);
    const others = [...STAT_GROUPS[group]].filter((s) => !focus.includes(s));
    const points: Partial<Record<StatId, number>> = {};
    for (let p = 0; p < OUTER_POINTS_PER_LEVEL; p++) {
      // Focus stats take turns; the others only get what they can't hold.
      const candidates = focused.filter((s) => room(s) > 0);
      const fallback = others.filter((s) => room(s) > 0).sort((a, b) => room(b) - room(a));
      // No room anywhere in the group: the engine will report it.
      const stat = candidates.length ? candidates[p % candidates.length]! : (fallback[0] ?? focused[0] ?? others[0]!);
      points[stat] = (points[stat] ?? 0) + 1;
      current[stat]++;
    }
    levels.push({ group, points });
  }
  return levels;
}

// Answers every package choice the engine can check: the concept's valid
// answers first, then the first Traits in the pool that aren't held yet.
// Contacts and pools with nothing in them are left for the player.
function answerChoices(concept: Concept, content: Content): ChoiceAnswer[] {
  const answers: ChoiceAnswer[] = [];
  const taken = new Set<string>();
  for (const slot of ["origin", "profession", "past"] as const) {
    const pkg = content.packages.find((p) => p.id === concept[slot] && p.type === slot);
    if (!pkg) continue;
    for (const g of pkg.grants) taken.add(g.trait);
    const pools = new Map<string, number>();
    for (const c of pkg.choices) pools.set(c.from, (pools.get(c.from) ?? 0) + c.choose);
    for (const [from, count] of pools) {
      const pool = choicePool(from, content);
      if (isFreeTextPool(from) || pool.length === 0) continue;
      const ids = new Set(pool.map((t) => t.id));
      const given = concept.choices.find((a) => a.package === pkg.id && a.from === from)?.traits ?? [];
      const chosen = [...new Set(given)].filter((id) => ids.has(id) && !taken.has(id));
      for (const t of pool) if (!chosen.includes(t.id) && !taken.has(t.id)) chosen.push(t.id);
      const traits = chosen.slice(0, count);
      traits.forEach((id) => taken.add(id));
      answers.push({ package: pkg.id, from, traits });
    }
  }
  return answers;
}

// Choices from pools with nothing in them yet can't be answered by anyone, so
// they're filled with placeholders while checking, the way checkBuild does.
function openPlaceholders(build: Build, content: Content): ChoiceAnswer[] {
  const out: ChoiceAnswer[] = [];
  for (const slot of ["origin", "profession", "past"] as const) {
    const pkg = content.packages.find((p) => p.id === build[slot] && p.type === slot);
    const pools = new Map<string, number>();
    for (const c of pkg?.choices ?? []) pools.set(c.from, (pools.get(c.from) ?? 0) + c.choose);
    for (const [from, count] of pools) {
      if (isFreeTextPool(from) || choicePool(from, content).length) continue;
      out.push({ package: pkg!.id, from, traits: Array.from({ length: count }, (_, i) => `player-choice-${i + 1}`) });
    }
  }
  return out;
}

const remaining = (r: BuildResult, kind: PickKind) => r.summary?.picks[kind].banked ?? 0;

export function solveConcept(input: unknown, content: Content, campaign: Campaign = DEFAULT_CAMPAIGN): Solution | { error: string } {
  const parsed = Concept.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join(".") || "concept"}: ${i.message}`).join("; ") };
  }
  const concept = parsed.data;
  const traits = new Map<string, Trait>(content.traits.map((t) => [t.id, t]));

  let build: Build = Build.parse({
    ...(concept.name ? { name: concept.name } : {}),
    kind: concept.kind,
    ...(concept.form ? { form: concept.form } : {}),
    origin: concept.origin,
    profession: concept.profession,
    past: concept.past,
    level: campaign.startingLevel,
    levels: allocateLevels(concept.focus, baseStats(concept, content), campaign.startingLevel),
    traits: [],
    choices: answerChoices(concept, content),
  });
  const open = openPlaceholders(build, content);
  const check = (b: Build) => validateBuild({ ...b, choices: [...b.choices, ...open] }, content, campaign);
  let result = check(build);
  const taken: string[] = [];
  const skipped: SkippedTrait[] = [];
  // Kind, form, packages or stats are wrong: there's nothing to buy Traits for.
  if (!result.ok) return { build, taken, filled: [], skipped, result };

  // Buys the next rank of a Trait if the engine allows it, or says why not.
  const buy = (id: string): string | undefined => {
    const t = traits.get(id);
    if (!t) return `Trait "${id}" doesn't exist`;
    const universal = remaining(result, "universal");
    const background = remaining(result, "background");
    if (universal + background === 0) return "no picks left";
    const held = result.summary!.traits.find((h) => h.trait === id);
    if (held && !t.ranked) return `already held (from ${held.sources.join(", ")})`;
    const onList = result.summary!.backgroundList.includes(id);
    // Background picks are the narrower kind, so spend them where they fit.
    const pick: PickKind | undefined =
      onList && background > 0 ? "background" : !t.background && universal > 0 ? "universal" : undefined;
    if (!pick) return t.background ? `${t.name} needs a background pick, and none fit` : "no universal picks left";
    const next: Build = { ...build, traits: [...build.traits, { trait: id, rank: (held?.rank ?? 0) + 1, pick }] };
    const verdict = check(next);
    if (!verdict.ok) return verdict.errors[0]!.message;
    build = next;
    result = verdict;
    return undefined;
  };

  for (const id of concept.traits) {
    const reason = buy(id);
    if (reason) skipped.push({ trait: id, reason });
    else taken.push(id);
  }
  // Background picks left over go to the Background Trait list, which comes
  // from the character's own packages and Kind, in list order.
  const filled: string[] = [];
  for (const id of result.summary!.backgroundList) {
    if (remaining(result, "background") === 0) break;
    if (result.summary!.traits.some((h) => h.trait === id)) continue;
    if (!buy(id)) filled.push(id);
  }
  return { build, taken, filled, skipped, result };
}
