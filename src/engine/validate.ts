// Checks a character build against the creation rules in docs/PLAN.md
// (Decisions → Character creation). Deterministic: same build and content,
// same result.
import { OPEN_CORE_STATS, STAT_CAP, STAT_GROUPS, StatId, type BackgroundPackage, type StatBlock, type Trait, type TraitChoice } from "../schema/index.js";
import { Build, DEFAULT_CAMPAIGN, type Campaign, type PickKind, type StatGroup } from "./build.js";
import type { Content } from "./content.js";

export type IssueCode =
  | "schema"
  | "kind"
  | "package"
  | "level"
  | "allocation"
  | "stat-max"
  | "stat-cap"
  | "choice"
  | "choice-pool"
  | "unknown-trait"
  | "pick-type"
  | "conveyed"
  | "picks-overspent"
  | "duplicate-trait"
  | "rank"
  | "rank-stats"
  | "min-stats"
  | "prerequisite"
  | "core-access";

export interface Issue {
  code: IssueCode;
  message: string;
  // Where in the build the problem is, e.g. "levels[0].points" or "traits[2]".
  path?: string;
}

export interface PickCount {
  available: number;
  spent: number;
  // Unspent picks. Allowed: the player can bank them for later.
  banked: number;
}

export interface HeldTrait {
  trait: string;
  rank: number;
  // Where each rank came from, e.g. "origin dreft" or "universal pick".
  sources: string[];
}

// A choice the build has to answer: one asked by a background package, or by
// a Trait the build holds (once per rank, for a ranked Trait).
export interface ChoiceQuestion {
  by: "package" | "trait";
  id: string;
  name: string;
  from: string;
  count: number;
  notes: string[];
}

export interface BuildSummary {
  stats: Record<StatId, number>;
  coreStats: Record<StatGroup, number>;
  // The core stats this build can level: Physical, Social and Mental, plus any
  // a held Trait opens, like Magic.
  coreAccess: StatGroup[];
  // HP is 10 plus the Physical focus stats; VP and SP are the Social and
  // Mental focus stat totals; MP is 3 per point of Magic. Kinds and Traits
  // can add to any of them.
  resources: Record<"hp" | "vp" | "sp" | "mp", number>;
  picks: Record<PickKind, PickCount>;
  traits: HeldTrait[];
  // Traits the build may spend background picks on.
  backgroundList: string[];
  // Every choice the build asks, packages first, answered or not.
  questions: ChoiceQuestion[];
}

export interface BuildResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  // Missing when the build didn't match the Build schema.
  summary?: BuildSummary;
}

const STATS = StatId.options;
const PACKAGE_SLOTS = ["origin", "profession", "past"] as const;
export const FOCUS_POINTS_PER_LEVEL = 3;
export const BASE_HP = 10;
export const MP_PER_MAGIC = 3;

// Choice pools the engine knows how to resolve. Others (and pools with no
// Traits in them yet) can't be checked, so answers to them only warn.
const POOLS: Record<string, (t: Trait) => boolean> = {
  language: (t) => t.types.includes("language"),
  "dreftian-language": (t) => t.types.includes("language") && t.region === "dreft",
  "spoken-language": (t) => t.types.includes("language") && !t.tags.includes("writing"),
};

// A pool answered with a spoken language that brings its written form too.
export const SPOKEN_AND_WRITTEN = "spoken-and-written-language";

// The written form of a spoken language Trait, matched by `language`.
export function writtenForm(spoken: Trait, content: Content): Trait | undefined {
  if (!spoken.language) return undefined;
  return content.traits.find((t) => t.language === spoken.language && t.types.includes("language") && t.tags.includes("writing"));
}

// Pools the player answers in their own words instead of with Trait ids. A
// Contact is whoever the player says it is, so any name counts; a Place is
// whichever seas, region or road a Knowledge covers, like Seafaring's.
export const FREE_TEXT_POOLS: Record<string, string> = { contact: "Contact", place: "Place" };

export const isFreeTextPool = (from: string) => Object.hasOwn(FREE_TEXT_POOLS, from);

// The Traits a package choice pool can be answered from. Empty when the engine
// can't resolve the pool, or nothing is in it yet.
export function choicePool(from: string, content: Content): Trait[] {
  if (from === SPOKEN_AND_WRITTEN) return content.traits.filter((t) => POOLS["spoken-language"]!(t) && writtenForm(t, content));
  const test = POOLS[from];
  return test ? content.traits.filter(test) : [];
}

// Whether an answer is to this question.
export const answers = (a: { package?: string; trait?: string; from: string }, q: ChoiceQuestion) => a[q.by] === q.id && a.from === q.from;

// A package's or Trait's choices, one question per pool. `times` repeats them
// for each rank of a ranked Trait.
function questionsOf(by: ChoiceQuestion["by"], owner: { id: string; name: string; choices: TraitChoice[] }, times = 1): ChoiceQuestion[] {
  const out: ChoiceQuestion[] = [];
  for (const c of owner.choices) {
    const q = out.find((o) => o.from === c.from);
    if (q) {
      q.count += c.choose * (c.perRank === false ? 1 : times);
      if (c.note) q.notes.push(c.note);
    } else out.push({ by, id: owner.id, name: owner.name, from: c.from, count: c.choose * (c.perRank === false ? 1 : times), notes: c.note ? [c.note] : [] });
  }
  return out;
}

// The core stats a character holding these Traits can level: Physical, Social
// and Mental, plus any a Trait opens, like Magical Heritage's Magic.
export function coreAccessOf(traitIds: Iterable<string>, content: Content): StatGroup[] {
  const open = new Set<StatGroup>(OPEN_CORE_STATS);
  for (const id of traitIds) for (const g of content.traits.find((t) => t.id === id)?.coreAccess ?? []) open.add(g);
  return [...open];
}

const label = (t: Trait) => `${t.name} (${t.id})`;
const aOrAn = (word: string) => (/^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`);

export function validateBuild(input: unknown, content: Content, campaign: Campaign = DEFAULT_CAMPAIGN): BuildResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const error = (code: IssueCode, message: string, path?: string) => errors.push({ code, message, path });
  const warn = (code: IssueCode, message: string, path?: string) => warnings.push({ code, message, path });

  const parsed = Build.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      error("schema", `${issue.path.join(".") || "build"}: ${issue.message}`, issue.path.join(".") || undefined);
    }
    return { ok: false, errors, warnings };
  }
  const build = parsed.data;
  const traits = new Map(content.traits.map((t) => [t.id, t]));

  // Rule 1: every stat starts at 0, and the Kind adds its bonus.
  const kind = content.kinds.find((k) => k.id === build.kind);
  if (!kind) error("kind", `Kind "${build.kind}" doesn't exist`, "kind");
  const base: StatBlock | undefined = kind?.stats;

  const packages: BackgroundPackage[] = [];
  for (const slot of PACKAGE_SLOTS) {
    const pkg = content.packages.find((p) => p.id === build[slot]);
    if (!pkg) error("package", `${slot} "${build[slot]}" doesn't exist`, slot);
    else if (pkg.type !== slot) error("package", `${pkg.name} is ${aOrAn(pkg.type)}, not ${aOrAn(slot)}`, slot);
    else packages.push(pkg);
  }

  // Rule 2: the build starts at the campaign's starting level.
  if (build.level !== campaign.startingLevel) {
    error("level", `This campaign starts characters at level ${campaign.startingLevel}, but the build is level ${build.level}`, "level");
  }
  if (build.levels.length !== build.level) {
    error("level", `A level ${build.level} character needs ${build.level} level allocations, but the build has ${build.levels.length}`, "levels");
  }

  const stats = Object.fromEntries(STATS.map((s) => [s, base?.[s]?.bonus ?? 0])) as Record<StatId, number>;

  // Rule 1: a Kind's free bonus points are all placed, by the player.
  const free = kind?.freePoints ?? 0;
  let placed = 0;
  for (const [stat, points = 0] of Object.entries(build.startPoints)) {
    stats[stat as StatId] += points;
    placed += points;
  }
  if (kind && placed !== free) {
    error(
      "allocation",
      !free
        ? `${kind.name} has no free bonus points, but the build places ${placed}`
        : placed < free
          ? placed === 0
            ? `Place ${kind.name}'s ${free} free bonus points`
            : `Place ${free - placed} more of ${kind.name}'s ${free} free bonus points`
          : `${kind.name} gives ${free} free bonus points, but the build places ${placed}`,
      "startPoints",
    );
  }

  // Rule 3: each level is 1 core point and 3 focus points in that group, or
  // no focus points for a core stat without any, like Magic.
  const coreStats = Object.fromEntries(Object.keys(STAT_GROUPS).map((g) => [g, 0])) as Record<StatGroup, number>;
  build.levels.forEach((lvl, i) => {
    const path = `levels[${i}].points`;
    coreStats[lvl.group]++;
    const groupStats: readonly string[] = STAT_GROUPS[lvl.group];
    const perLevel = groupStats.length ? FOCUS_POINTS_PER_LEVEL : 0;
    let total = 0;
    for (const [stat, points = 0] of Object.entries(lvl.points)) {
      if (!groupStats.includes(stat)) {
        const which = groupStats.length ? ` (${groupStats.join(", ")})` : `; ${lvl.group} has no focus stats`;
        error("allocation", `Level ${i + 1} puts points in ${stat}, which isn't a ${lvl.group} stat${which}`, path);
      }
      stats[stat as StatId] += points;
      total += points;
    }
    if (total !== perLevel && perLevel) {
      error("allocation", `Level ${i + 1} spends ${total} focus points; each level gives exactly ${FOCUS_POINTS_PER_LEVEL}`, path);
    }
  });

  // Rule 4: no stat above its Kind max, and nothing above 20.
  if (base) {
    for (const stat of STATS) {
      const max = base[stat]?.max ?? STAT_CAP;
      if (stats[stat] > STAT_CAP) error("stat-cap", `${stat} is ${stats[stat]}; nothing can exceed ${STAT_CAP}`, "levels");
      else if (stats[stat] > max) error("stat-max", `${stat} is ${stats[stat]}, above the ${kind!.name} max of ${max}`, "levels");
    }
  }

  // Rule 5: odd points on a stat's bar are universal picks, even points background.
  const picks: Record<PickKind, PickCount> = {
    universal: { available: STATS.reduce((n, s) => n + Math.ceil(stats[s] / 2), 0), spent: 0, banked: 0 },
    background: { available: STATS.reduce((n, s) => n + Math.floor(stats[s] / 2), 0), spent: 0, banked: 0 },
  };

  // Rule 6: package grants come free; ranks from several packages don't stack.
  const held = new Map<string, HeldTrait>();
  const hold = (id: string, rank: number, source: string) => {
    const h = held.get(id);
    if (!h) held.set(id, { trait: id, rank, sources: [source] });
    else {
      h.rank = Math.max(h.rank, rank);
      h.sources.push(source);
    }
  };
  for (const g of kind?.grants ?? []) hold(g.trait, g.rank ?? 1, `kind ${kind!.id}`);
  for (const pkg of packages) {
    for (const g of pkg.grants) hold(g.trait, g.rank ?? 1, `${pkg.type} ${pkg.id}`);
  }

  // Rule 6: every choice answered with the right count, from its pool. Package
  // choices are checked here; a held Trait's choices once the picks are in.
  const answered = new Set<number>();
  const questions: ChoiceQuestion[] = [];
  const answer = (q: ChoiceQuestion, source: string, afterPicks: boolean) => {
    questions.push(q);
    const { name, from, count } = q;
    const noun = FREE_TEXT_POOLS[from];
    const i = build.choices.findIndex((a) => !answered.has(build.choices.indexOf(a)) && answers(a, q));
    const given = i < 0 ? 0 : build.choices[i]!.traits.length;
    // A Contact or Place the player hasn't recorded yet is a reminder, not an error.
    if (noun && given < count) {
      const left = count - given;
      const which = from === "contact" ? "who" : "which";
      warn("choice", `${name} gives ${count} ${noun}${count > 1 ? "s" : ""}: record ${left > 1 ? `${left} more` : given ? "one more" : which} on the Choices step`, i < 0 ? "choices" : `choices[${i}]`);
    }
    if (i < 0) {
      if (!noun) error("choice", `${name} asks for ${count} from "${from}", but the build doesn't answer it`, "choices");
      return;
    }
    answered.add(i);
    const a = build.choices[i]!;
    const path = `choices[${i}]`;
    if (noun ? given > count : given !== count) {
      error("choice", `${name} asks for ${count} from "${from}", but the build gives ${given}`, path);
    }
    if (new Set(a.traits).size !== a.traits.length) {
      error("choice", `${name}'s "${from}" answer lists the same ${noun ?? "Trait"} twice`, path);
    }
    // Free-text answers are names, not Traits: nothing to look up or hold.
    if (isFreeTextPool(from)) return;
    const pool = choicePool(from, content);
    if (pool.length === 0) {
      warn("choice-pool", `Can't check ${name}'s "${from}" answer (${a.traits.join(", ")}): no Traits are defined for that pool yet`, path);
    } else {
      for (const id of a.traits) {
        const t = traits.get(id);
        if (!t) error("unknown-trait", `Trait "${id}" doesn't exist`, path);
        else if (!pool.includes(t)) error("choice", `${label(t)} isn't in the "${from}" pool for ${name}`, path);
        // Package answers are in before the picks, which catch doubles; a
        // Trait's answers come after, so they check for themselves.
        else if (afterPicks && held.has(id)) error("duplicate-trait", `${label(t)} is already held (from ${held.get(id)!.sources.join(", ")}), so ${name} can't give it again`, path);
      }
    }
    for (const id of a.traits) hold(id, 1, `${source} choice`);
    // A spoken-and-written answer brings the language's written form as well.
    if (from === SPOKEN_AND_WRITTEN) {
      for (const id of a.traits) {
        const written = traits.has(id) ? writtenForm(traits.get(id)!, content) : undefined;
        if (!written) continue;
        if (afterPicks && held.has(written.id)) {
          error("duplicate-trait", `${label(written)} is already held (from ${held.get(written.id)!.sources.join(", ")}), so ${name} can't give it again`, path);
        }
        hold(written.id, 1, `${source} choice`);
      }
    }
  };
  for (const pkg of packages) {
    for (const q of questionsOf("package", pkg)) answer(q, `${pkg.type} ${pkg.id}`, false);
  }

  // Rule 7: the Background Trait list is the packages' backgroundTraits plus
  // Traits tagged with one of the Kind's traitAccess pools.
  const access = new Set(kind?.traitAccess ?? []);
  const backgroundList = new Set(packages.flatMap((p) => p.backgroundTraits));
  // Conveyed Traits never go on it: no pick can buy them.
  for (const t of content.traits) if (!t.conveyed && t.tags.some((tag) => access.has(tag))) backgroundList.add(t.id);

  // Group picks by Trait, keeping their positions for error paths.
  const byTrait = new Map<string, { rank: number; index: number }[]>();
  build.traits.forEach((p, index) => {
    const t = traits.get(p.trait);
    const path = `traits[${index}]`;
    if (!t) {
      error("unknown-trait", `Trait "${p.trait}" doesn't exist`, path);
      return;
    }
    picks[p.pick].spent++;
    // Conveyed Traits come from packages, choices or play, never from a pick.
    if (t.conveyed) {
      error("conveyed", `${label(t)} is Conveyed: it comes from a package or from play, not from a pick`, path);
    }
    // Rules 7 and 9: universal picks take any non-background Trait (knowledge
    // included, at creation); background picks come from the Background list.
    if (p.pick === "universal" && t.background) {
      error("pick-type", `${label(t)} is a Background Trait and needs a background pick`, path);
    }
    if (p.pick === "background" && !backgroundList.has(t.id)) {
      error("pick-type", `${label(t)} isn't on this character's Background Trait list, so it needs a universal pick`, path);
    }
    if (!byTrait.has(t.id)) byTrait.set(t.id, []);
    byTrait.get(t.id)!.push({ rank: p.rank, index });
  });

  // Rule 10: non-ranked Traits once only; ranks bought in order, with stats to match.
  for (const [id, bought] of byTrait) {
    const t = traits.get(id)!;
    const before = held.get(id);
    const baseRank = before?.rank ?? 0;
    const from = before ? ` (from ${before.sources.join(", ")})` : "";
    if (!t.ranked) {
      for (const b of bought) {
        if (b.rank > 1) error("rank", `${label(t)} isn't ranked, so it can't go above rank 1`, `traits[${b.index}]`);
      }
      if (baseRank > 0) error("duplicate-trait", `${label(t)} is already held${from} and isn't ranked, so it can't be taken again`, `traits[${bought[0]!.index}]`);
      else if (bought.length > 1) error("duplicate-trait", `${label(t)} isn't ranked, so it can't be taken twice`, `traits[${bought[1]!.index}]`);
      hold(id, 1, `${build.traits[bought[0]!.index]!.pick} pick`);
      continue;
    }
    let next = baseRank + 1;
    for (const b of [...bought].sort((x, y) => x.rank - y.rank)) {
      const path = `traits[${b.index}]`;
      if (b.rank < next) {
        error("rank", `${label(t)} is already at rank ${next - 1}${b.rank <= baseRank ? from : ""}, so a pick for rank ${b.rank} does nothing`, path);
        continue;
      }
      if (b.rank > next) error("rank", `${label(t)} rank ${b.rank} needs rank ${next} first`, path);
      next = b.rank + 1;
      hold(id, b.rank, `${build.traits[b.index]!.pick} pick`);
    }
    const top = Math.max(...bought.map((b) => b.rank));
    if (top > 1) {
      const short = t.rankStats.filter((s) => stats[s] < 3 * top);
      if (short.length) {
        const have = short.map((s) => `${s} ${stats[s]}`).join(", ");
        error("rank-stats", `${label(t)} rank ${top} needs ${t.rankStats.join(", ")} of at least ${3 * top} (has ${have})`, "traits");
      }
    }
  }

  // Rule 6: the choices of the Traits the build holds, by rank.
  for (const h of [...held.values()]) {
    const t = traits.get(h.trait);
    if (!t?.choices.length) continue;
    for (const q of questionsOf("trait", t, t.ranked ? h.rank : 1)) answer(q, `trait ${t.id}`, true);
  }
  build.choices.forEach((a, i) => {
    if (answered.has(i)) return;
    const path = `choices[${i}]`;
    if (a.package !== undefined) {
      const inBuild = packages.some((p) => p.id === a.package);
      error(
        "choice",
        inBuild ? `${a.package} has no "${a.from}" choice, or it's answered twice` : `The build answers a choice for "${a.package}", which isn't one of its packages`,
        path,
      );
    } else {
      const name = traits.get(a.trait!)?.name ?? a.trait;
      error(
        "choice",
        held.has(a.trait!) ? `${name} has no "${a.from}" choice, or it's answered twice` : `The build answers a choice for ${name}, which it doesn't hold`,
        path,
      );
    }
  });

  // Rule 10: prerequisites must be held, from any source.
  build.traits.forEach((p, index) => {
    const t = traits.get(p.trait);
    for (const req of t?.prerequisites ?? []) {
      if (!held.has(req)) {
        const name = traits.get(req)?.name ?? req;
        error("prerequisite", `${label(t!)} needs ${name} (${req}) first`, `traits[${index}]`);
      }
    }
    // "Any Pilot skill": some held Trait, other than this one, carries the tag.
    for (const tag of t?.prerequisiteTags ?? []) {
      const has = [...held.keys()].some((id) => id !== t!.id && traits.get(id)?.tags.includes(tag));
      if (!has) error("prerequisite", `${label(t!)} needs a Trait tagged ${tag} first`, `traits[${index}]`);
    }
  });

  // Rule 13: a level can only go to a core stat the build can level. Magic
  // needs a held Trait that opens it, like the Dreftian Kinds' Magical Heritage.
  const coreAccess = new Set(coreAccessOf(held.keys(), content));
  for (const g of Object.keys(coreStats) as StatGroup[]) {
    if (!coreStats[g] || coreAccess.has(g)) continue;
    const openers = content.traits.filter((t) => t.coreAccess.includes(g as never)).map((t) => t.name);
    const name = g.charAt(0).toUpperCase() + g.slice(1);
    error(
      "core-access",
      `${coreStats[g]} ${coreStats[g] === 1 ? "level goes" : "levels go"} to ${name}, which this character can't level${openers.length ? ` without ${openers.join(" or ")}` : ""}`,
      "levels",
    );
  }

  // Rule 12: a picked Trait's minimum stats, focus and core, once per Trait.
  for (const id of byTrait.keys()) {
    const t = traits.get(id)!;
    const short = Object.entries(t.minStats).filter(([s, min]) => {
      const have = s in coreStats ? coreStats[s as StatGroup] : stats[s as StatId];
      return min !== undefined && have < min;
    });
    if (short.length) {
      const need = Object.entries(t.minStats).map(([s, min]) => `${s} ${min}`).join(", ");
      const have = short.map(([s]) => `${s} ${s in coreStats ? coreStats[s as StatGroup] : stats[s as StatId]}`).join(", ");
      error("min-stats", `${label(t)} needs ${need} (has ${have})`, `traits[${byTrait.get(id)![0]!.index}]`);
    }
  }

  // Rule 8: unspent picks are banked; overspending is an error.
  for (const kindOfPick of ["universal", "background"] as const) {
    const p = picks[kindOfPick];
    p.banked = Math.max(0, p.available - p.spent);
    if (p.spent > p.available) {
      error("picks-overspent", `The build spends ${p.spent} ${kindOfPick} picks but its stats give only ${p.available}`, "traits");
    }
  }

  const focusTotal = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + stats[s], 0);
  const resources = { hp: BASE_HP + focusTotal("physical"), vp: focusTotal("social"), sp: focusTotal("mental"), mp: MP_PER_MAGIC * coreStats.magic };
  const RESOURCES = ["hp", "vp", "sp", "mp"] as const;
  for (const r of RESOURCES) resources[r] += kind?.resources[r] ?? 0;
  for (const h of held.values()) {
    const bonus = traits.get(h.trait)?.resources ?? {};
    for (const r of RESOURCES) resources[r] += (bonus[r] ?? 0) * h.rank;
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      stats,
      coreStats,
      coreAccess: [...coreAccess],
      resources,
      picks,
      traits: [...held.values()],
      backgroundList: [...backgroundList].sort(),
      questions,
    },
  };
}
