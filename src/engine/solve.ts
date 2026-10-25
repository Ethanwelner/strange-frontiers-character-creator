// Turns a character concept into a full build. The concept says who the
// character is: Kind, packages, which stats matter most, and the Traits that
// fit, best first. The solver does the bookkeeping the model shouldn't: it
// spreads each level's stat points (adding any stats the requested ranks
// need to the priority stats), answers package and Trait choices it can resolve, and
// buys Traits from the list in order, asking validateBuild about each one
// and skipping any the engine rejects. Deterministic and browser-safe.
import { z } from "zod";
import { STAT_CAP, STAT_GROUPS, StatId, type StatBlock, type Trait } from "../schema/index.js";
import { Build, ChoiceAnswer, DEFAULT_CAMPAIGN, type Campaign, type LevelAllocation, type PickKind, type StatGroup } from "./build.js";
import type { Content } from "./content.js";
import { answers, choicePool, isFreeTextPool, FOCUS_POINTS_PER_LEVEL, validateBuild, type BuildResult } from "./validate.js";

// The Kind and package fields take ids, as the Build does, so a name like
// "Dreft" comes back to the model as a format problem it can fix.
const ConceptId = (what: string, example: string) =>
  z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, `must be a ${what} id like "${example}", not a name`);

export const Concept = z.object({
  name: z.string().optional(),
  kind: ConceptId("Kind", "isek"),
  origin: ConceptId("package", "dreft"),
  profession: ConceptId("package", "guild-hunter"),
  past: ConceptId("package", "countryside-upbringing"),
  // Priority stats, most important first. Levels go to the groups these
  // stats are in, in this order, and points go to these stats first.
  focus: z.array(z.string()).default([]),
  // Trait ids, best fit first. Listing a ranked Trait twice asks for rank 2.
  traits: z.array(z.string()).default([]),
  // Answers to package or Trait choices the engine can check, like languages.
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
  skipped: SkippedTrait[];
  // validateBuild on the finished build, with open choices set aside.
  result: BuildResult;
}

const GROUP_OF = Object.fromEntries(
  Object.entries(STAT_GROUPS).flatMap(([group, stats]) => stats.map((s) => [s, group])),
) as Record<StatId, StatGroup>;

const isStat = (s: string): s is StatId => StatId.safeParse(s).success;

function baseStats(concept: Concept, content: Content): StatBlock | undefined {
  return content.kinds.find((k) => k.id === concept.kind)?.stats;
}

// Places a Kind's free bonus points: into the priority stats in turn, then into
// whichever stat has the most room. Stats with a max of 0 never get one.
export function allocateStart(focusIn: string[], base: StatBlock | undefined, free: number): Partial<Record<StatId, number>> {
  const focus = [...new Set(focusIn.filter(isStat))];
  const current = Object.fromEntries(StatId.options.map((s) => [s, base?.[s]?.bonus ?? 0])) as Record<StatId, number>;
  const room = (s: StatId) => Math.min(base?.[s]?.max ?? STAT_CAP, STAT_CAP) - current[s];
  const points: Partial<Record<StatId, number>> = {};
  for (let p = 0; p < free; p++) {
    const candidates = focus.filter((s) => room(s) > 0);
    const stat = candidates.length ? candidates[p % candidates.length]! : [...StatId.options].sort((a, b) => room(b) - room(a))[0]!;
    if (room(stat) <= 0) break;
    points[stat] = (points[stat] ?? 0) + 1;
    current[stat]++;
  }
  return points;
}

// From the third level on, every other level in a group gives its last point
// to that group's weakest stat, so a lawyer's Social levels still build some
// Demeanor while Persuasion stays well ahead.
const SPREAD_FROM_LEVEL = 3;
// From the sixth level on, every fifth level (6, 11, 16) goes to the group
// with the fewest levels so far, so the character isn't helpless outside their
// specialty.
const BREADTH_FROM_LEVEL = 6;
const BREADTH_EVERY = 5;

// One allocation per level. Each level goes to the next group in priority order,
// and its points go to that group's priority stats in turn, then to whichever of
// its stats has the most room. A group with no room left is passed over. As the
// level rises, some points spread out (SPREAD_FROM_LEVEL, BREADTH_FROM_LEVEL).
export function allocateLevels(focusIn: string[], base: StatBlock | undefined, level: number): LevelAllocation[] {
  const focus = [...new Set(focusIn.filter(isStat))];
  const current = Object.fromEntries(StatId.options.map((s) => [s, base?.[s]?.bonus ?? 0])) as Record<StatId, number>;
  const max = (s: StatId) => Math.min(base?.[s]?.max ?? STAT_CAP, STAT_CAP);
  const room = (s: StatId) => max(s) - current[s];

  // Groups in priority order, then the rest by how much room they have.
  const unfocused = (Object.keys(STAT_GROUPS) as StatGroup[])
    .filter((g) => !focus.some((s) => GROUP_OF[s] === g))
    .sort((a, b) => STAT_GROUPS[b].reduce((n, s) => n + room(s), 0) - STAT_GROUPS[a].reduce((n, s) => n + room(s), 0));
  const groups = [...new Set(focus.map((s) => GROUP_OF[s]))];
  const order = groups.length ? groups : unfocused;
  const groupRoom = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + room(s), 0);

  const levels: LevelAllocation[] = [];
  const levelsIn = (g: StatGroup) => levels.filter((l) => l.group === g).length;
  let focusLevels = 0;
  for (let i = 0; i < level; i++) {
    const n = i + 1;
    const breadth = n >= BREADTH_FROM_LEVEL && (n - BREADTH_FROM_LEVEL) % BREADTH_EVERY === 0;
    // The least-built group with room, the most room breaking a tie.
    const least = (Object.keys(STAT_GROUPS) as StatGroup[])
      .filter((g) => groupRoom(g) >= FOCUS_POINTS_PER_LEVEL)
      .sort((a, b) => levelsIn(a) - levelsIn(b) || groupRoom(b) - groupRoom(a))[0];
    const preferred = breadth && least ? least : order[focusLevels++ % order.length]!;
    const group = [preferred, ...order, ...unfocused].find((g) => groupRoom(g) >= FOCUS_POINTS_PER_LEVEL) ?? preferred;
    // This group's 2nd, 4th, 6th... level spreads, once the character is level 3.
    const spreads = n >= SPREAD_FROM_LEVEL && levelsIn(group) % 2 === 1;
    const focused = focus.filter((s) => GROUP_OF[s] === group);
    const others = [...STAT_GROUPS[group]].filter((s) => !focus.includes(s));
    const points: Partial<Record<StatId, number>> = {};
    for (let p = 0; p < FOCUS_POINTS_PER_LEVEL; p++) {
      // The group's weakest stat with room, the most room breaking a tie.
      const weakest = [...STAT_GROUPS[group]].filter((s) => room(s) > 0).sort((a, b) => current[a] - current[b] || room(b) - room(a))[0];
      const spread = spreads && p === FOCUS_POINTS_PER_LEVEL - 1 && weakest;
      // Focus stats take turns; the others only get what they can't hold.
      const candidates = focused.filter((s) => room(s) > 0);
      const fallback = others.filter((s) => room(s) > 0).sort((a, b) => room(b) - room(a));
      // A group with no priority stats, like a breadth level's, builds its weakest
      // stats. No room anywhere in the group: the engine will report it.
      const stat =
        spread || (!focused.length && weakest) ? weakest! : candidates.length ? candidates[p % candidates.length]! : (fallback[0] ?? focused[0] ?? others[0]!);
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

// The concept's focus, plus the stats any rank above 1 it asks for will need.
// Ranking a Trait past 1 needs each of its rankStats at 3 × the rank, so a
// stat the model left out of focus would get no points and the rank would be
// skipped. The model's own focus keeps its priority; these follow it.
export function rankFocus(concept: Concept, content: Content): string[] {
  const traits = new Map<string, Trait>(content.traits.map((t) => [t.id, t]));
  // Ranks granted by several packages don't stack, so take the highest.
  const granted = new Map<string, number>();
  for (const slot of ["origin", "profession", "past"] as const) {
    const pkg = content.packages.find((p) => p.id === concept[slot] && p.type === slot);
    for (const g of pkg?.grants ?? []) granted.set(g.trait, Math.max(granted.get(g.trait) ?? 0, g.rank ?? 1));
  }
  const listed = new Map<string, number>();
  for (const id of concept.traits) listed.set(id, (listed.get(id) ?? 0) + 1);

  const focus = [...concept.focus];
  for (const [id, count] of listed) {
    const t = traits.get(id);
    if (!t?.ranked || (granted.get(id) ?? 0) + count < 2) continue;
    for (const s of t.rankStats) if (!focus.includes(s)) focus.push(s);
  }
  return focus;
}

const remaining = (r: BuildResult, kind: PickKind) => r.summary?.picks[kind].banked ?? 0;

export function solveConcept(input: unknown, content: Content, campaign: Campaign = DEFAULT_CAMPAIGN): Solution | { error: string } {
  const parsed = Concept.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join(".") || "concept"}: ${i.message}`).join("; ") };
  }
  const concept = parsed.data;
  const traits = new Map<string, Trait>(content.traits.map((t) => [t.id, t]));

  // The Kind's free bonus points go to the focus first; the levels build on them.
  const focus = rankFocus(concept, content);
  const base = baseStats(concept, content);
  const startPoints = allocateStart(focus, base, content.kinds.find((k) => k.id === concept.kind)?.freePoints ?? 0);
  const afterStart = base && (Object.fromEntries(
    Object.entries(base).map(([s, r]) => [s, { ...r, bonus: r.bonus + (startPoints[s as StatId] ?? 0) }]),
  ) as StatBlock);

  let build: Build = Build.parse({
    ...(concept.name ? { name: concept.name } : {}),
    kind: concept.kind,
    origin: concept.origin,
    profession: concept.profession,
    past: concept.past,
    level: campaign.startingLevel,
    startPoints,
    levels: allocateLevels(focus, afterStart, campaign.startingLevel),
    traits: [],
    choices: answerChoices(concept, content),
  });
  let open = openPlaceholders(build, content);
  const check = (b: Build) => validateBuild({ ...b, choices: [...b.choices, ...open] }, content, campaign);

  // Answers the choices of the Traits a build holds, like the language an
  // Additional Language gives: the concept's valid answers first, then the
  // first Traits in the pool that aren't held. Contacts stay with the player,
  // and pools with nothing in them get placeholders while checking.
  const answerTraitChoices = (b: Build): Build => {
    const r = check(b);
    const held = new Set(r.summary?.traits.map((h) => h.trait) ?? []);
    let choices = b.choices;
    for (const q of r.summary?.questions ?? []) {
      if (q.by !== "trait" || isFreeTextPool(q.from)) continue;
      const pool = choicePool(q.from, content);
      if (pool.length === 0) {
        open = [...open.filter((a) => !answers(a, q)), { trait: q.id, from: q.from, traits: Array.from({ length: q.count }, (_, i) => `player-choice-${i + 1}`) }];
        continue;
      }
      const have = choices.find((a) => answers(a, q))?.traits ?? [];
      if (have.length >= q.count) continue;
      const ids = new Set(pool.map((t) => t.id));
      const wanted = concept.choices.find((a) => answers(a, q))?.traits ?? [];
      const picked = [...have];
      for (const id of [...wanted, ...pool.map((t) => t.id)]) {
        if (picked.length >= q.count) break;
        if (ids.has(id) && !picked.includes(id) && !held.has(id)) picked.push(id);
      }
      choices = [...choices.filter((a) => !answers(a, q)), { trait: q.id, from: q.from, traits: picked }];
    }
    return { ...b, choices };
  };
  let result = check(build);
  const taken: string[] = [];
  const skipped: SkippedTrait[] = [];
  // Kind, packages or stats are wrong: there's nothing to buy Traits for.
  if (!result.ok) return { build, taken, skipped, result };

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
    const before = open;
    const next = answerTraitChoices({ ...build, traits: [...build.traits, { trait: id, rank: (held?.rank ?? 0) + 1, pick }] });
    const verdict = check(next);
    if (!verdict.ok) {
      open = before;
      return verdict.errors[0]!.message;
    }
    build = next;
    result = verdict;
    return undefined;
  };

  for (const id of concept.traits) {
    const reason = buy(id);
    if (reason) skipped.push({ trait: id, reason });
    else taken.push(id);
  }
  // Picks the list didn't use stay banked, as the rules allow: filling them
  // from the Background Trait list in order gave every character the same
  // alphabetical Traits whatever they were described as.
  return { build, taken, skipped, result };
}
