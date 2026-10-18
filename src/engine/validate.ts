// Checks a character build against the creation rules in docs/PLAN.md
// (Decisions → Character creation). Deterministic: same build and content,
// same result.
import { STAT_CAP, STAT_GROUPS, StatId, type BackgroundPackage, type StatBlock, type Trait } from "../schema/index.js";
import { Build, DEFAULT_CAMPAIGN, type Campaign, type PickKind, type StatGroup } from "./build.js";
import type { Content } from "./content.js";

export type IssueCode =
  | "schema"
  | "kind"
  | "form"
  | "package"
  | "level"
  | "allocation"
  | "stat-max"
  | "stat-cap"
  | "choice"
  | "choice-pool"
  | "unknown-trait"
  | "pick-type"
  | "picks-overspent"
  | "duplicate-trait"
  | "rank"
  | "rank-stats"
  | "prerequisite";

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
  // Where each rank came from, e.g. "origin glintl" or "universal pick".
  sources: string[];
}

export interface BuildSummary {
  stats: Record<StatId, number>;
  innerRing: Record<StatGroup, number>;
  picks: Record<PickKind, PickCount>;
  traits: HeldTrait[];
  // Traits the build may spend background picks on.
  backgroundList: string[];
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
const OUTER_POINTS_PER_LEVEL = 3;

// Choice pools the engine knows how to resolve. Others (and pools with no
// Traits in them yet) can't be checked, so answers to them only warn.
const POOLS: Record<string, (t: Trait) => boolean> = {
  contact: (t) => t.category === "contact",
  language: (t) => t.types.includes("language"),
};

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

  // Rule 1: level 0 stats come from the Kind, or the chosen form.
  let base: StatBlock | undefined;
  const kind = content.kinds.find((k) => k.id === build.kind);
  if (!kind) {
    error("kind", `Kind "${build.kind}" doesn't exist`, "kind");
  } else if (kind.forms) {
    const form = kind.forms.find((f) => f.id === build.form);
    const options = kind.forms.map((f) => f.id).join(", ");
    if (build.form === undefined) error("form", `${kind.name} needs a form: ${options}`, "form");
    else if (!form) error("form", `${kind.name} has no form "${build.form}" (options: ${options})`, "form");
    base = form?.stats;
  } else {
    if (build.form !== undefined) error("form", `${kind.name} has no forms, but the build picks "${build.form}"`, "form");
    base = kind.stats;
  }

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

  // Rule 3: each level is 1 Inner Ring point and 3 Outer Ring points in that group.
  const stats = Object.fromEntries(STATS.map((s) => [s, base?.[s]?.start ?? 0])) as Record<StatId, number>;
  const innerRing = { physical: 0, social: 0, mental: 0 } as Record<StatGroup, number>;
  build.levels.forEach((lvl, i) => {
    const path = `levels[${i}].points`;
    innerRing[lvl.group]++;
    const groupStats: readonly string[] = STAT_GROUPS[lvl.group];
    let total = 0;
    for (const [stat, points = 0] of Object.entries(lvl.points)) {
      if (!groupStats.includes(stat)) {
        error("allocation", `Level ${i + 1} puts points in ${stat}, which isn't a ${lvl.group} stat (${groupStats.join(", ")})`, path);
      }
      stats[stat as StatId] += points;
      total += points;
    }
    if (total !== OUTER_POINTS_PER_LEVEL) {
      error("allocation", `Level ${i + 1} spends ${total} Outer Ring points; each level gives exactly ${OUTER_POINTS_PER_LEVEL}`, path);
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
  for (const pkg of packages) {
    for (const g of pkg.grants) hold(g.trait, g.rank ?? 1, `${pkg.type} ${pkg.id}`);
  }

  // Rule 6: every package choice answered with the right count, from its pool.
  const answered = new Set<number>();
  for (const pkg of packages) {
    const pools = new Map<string, number>();
    for (const c of pkg.choices) pools.set(c.from, (pools.get(c.from) ?? 0) + c.choose);
    for (const [from, count] of pools) {
      const i = build.choices.findIndex((a) => a.package === pkg.id && a.from === from);
      if (i < 0) {
        error("choice", `${pkg.name} asks for ${count} from "${from}", but the build doesn't answer it`, "choices");
        continue;
      }
      answered.add(i);
      const answer = build.choices[i]!;
      const path = `choices[${i}]`;
      if (answer.traits.length !== count) {
        error("choice", `${pkg.name} asks for ${count} from "${from}", but the build gives ${answer.traits.length}`, path);
      }
      if (new Set(answer.traits).size !== answer.traits.length) {
        error("choice", `${pkg.name}'s "${from}" answer lists the same Trait twice`, path);
      }
      const test = POOLS[from];
      const pool = test ? content.traits.filter(test) : [];
      if (pool.length === 0) {
        warn("choice-pool", `Can't check ${pkg.name}'s "${from}" answer (${answer.traits.join(", ")}): no Traits are defined for that pool yet`, path);
      } else {
        for (const id of answer.traits) {
          const t = traits.get(id);
          if (!t) error("unknown-trait", `Trait "${id}" doesn't exist`, path);
          else if (!test!(t)) error("choice", `${label(t)} isn't in the "${from}" pool for ${pkg.name}`, path);
        }
      }
      for (const id of answer.traits) hold(id, 1, `${pkg.type} ${pkg.id} choice`);
    }
  }
  build.choices.forEach((a, i) => {
    if (answered.has(i)) return;
    const inBuild = packages.some((p) => p.id === a.package);
    error(
      "choice",
      inBuild
        ? `${a.package} has no "${a.from}" choice, or it's answered twice`
        : `The build answers a choice for "${a.package}", which isn't one of its packages`,
      `choices[${i}]`,
    );
  });

  // Rule 7: the Background Trait list is the packages' backgroundTraits plus
  // Traits tagged with one of the Kind's featAccess pools.
  const access = new Set(kind?.featAccess ?? []);
  const backgroundList = new Set(packages.flatMap((p) => p.backgroundTraits));
  for (const t of content.traits) if (t.tags.some((tag) => access.has(tag))) backgroundList.add(t.id);

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

  // Rule 10: prerequisites must be held, from any source.
  build.traits.forEach((p, index) => {
    const t = traits.get(p.trait);
    for (const req of t?.prerequisites ?? []) {
      if (!held.has(req)) {
        const name = traits.get(req)?.name ?? req;
        error("prerequisite", `${label(t!)} needs ${name} (${req}) first`, `traits[${index}]`);
      }
    }
  });

  // Rule 8: unspent picks are banked; overspending is an error.
  for (const kindOfPick of ["universal", "background"] as const) {
    const p = picks[kindOfPick];
    p.banked = Math.max(0, p.available - p.spent);
    if (p.spent > p.available) {
      error("picks-overspent", `The build spends ${p.spent} ${kindOfPick} picks but its stats give only ${p.available}`, "traits");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      stats,
      innerRing,
      picks,
      traits: [...held.values()],
      backgroundList: [...backgroundList].sort(),
    },
  };
}
