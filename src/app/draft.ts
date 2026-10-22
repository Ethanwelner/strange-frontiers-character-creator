// The in-progress build the UI edits, and saving it. A draft is a Build that
// may not be finished: the engine checks it as-is and says what's missing.
// Stats are kept as a pool, the way a player spends them: Inner Ring points per
// group, each unlocking 3 Outer Ring points for that group's stats. The Build
// the engine checks splits the pool back into one allocation per level.
import type { ChoiceAnswer, LevelAllocation, PickKind, StatGroup, TraitPick } from "../engine/build.js";
import type { Campaign } from "../engine/build.js";
import type { DescribeResult, OpenChoice, Reason } from "../ai/types.js";
import { STAT_GROUPS, type StatId } from "../schema/index.js";
import { OUTER_POINTS_PER_LEVEL } from "../engine/validate.js";

export interface Draft {
  name?: string;
  kind?: string;
  origin?: string;
  profession?: string;
  past?: string;
  // Where the Kind's free level 0 points go, if it has any.
  startPoints?: Partial<Record<StatId, number>>;
  level: number;
  // Inner Ring points placed in each group; one per level.
  inner: Record<StatGroup, number>;
  // Outer Ring points placed above level 0, per stat.
  points: Partial<Record<StatId, number>>;
  traits: TraitPick[];
  choices: ChoiceAnswer[];
}

export const STEPS = ["character", "kind", "background", "stats", "traits", "choices", "sheet"] as const;
export type Step = (typeof STEPS)[number];

// What the builder keeps from the last AI build, so the reasons survive a reload.
export interface AiNotes {
  description: string;
  model?: string;
  status: DescribeResult["status"];
  summary?: string;
  reasons: Reason[];
  openChoices: OpenChoice[];
}

export interface Saved {
  draft: Draft;
  campaign: Campaign;
  step: Step;
  ai?: AiNotes;
}

const POOL_GROUPS = Object.keys(STAT_GROUPS) as StatGroup[];
export const noInner = (): Record<StatGroup, number> => ({ physical: 0, social: 0, mental: 0 });

export const EMPTY: Saved = {
  draft: { level: 3, inner: noInner(), points: {}, traits: [], choices: [] },
  campaign: { startingLevel: 3 },
  step: "character",
};

// The pool as level allocations: each Inner Ring point becomes a level in its
// group, filled with up to 3 of that group's points in stat order. Points a
// group can't hold go on its last level, so the engine still sees them.
export function poolToLevels(inner: Record<StatGroup, number>, points: Partial<Record<StatId, number>>): LevelAllocation[] {
  const levels: LevelAllocation[] = [];
  for (const g of POOL_GROUPS) {
    const left = STAT_GROUPS[g].map((s) => [s, points[s] ?? 0] as [StatId, number]);
    for (let i = 0; i < inner[g]; i++) {
      const lvl: LevelAllocation = { group: g, points: {} };
      let room = i === inner[g] - 1 ? Infinity : OUTER_POINTS_PER_LEVEL;
      for (const entry of left) {
        const take = Math.min(room, entry[1]);
        if (take > 0) {
          lvl.points[entry[0]] = take;
          entry[1] -= take;
          room -= take;
        }
      }
      levels.push(lvl);
    }
  }
  return levels;
}

// Level allocations back into a pool.
export function levelsToPool(levels: LevelAllocation[]): Pick<Draft, "inner" | "points"> {
  const inner = noInner();
  const points: Partial<Record<StatId, number>> = {};
  for (const lvl of levels) {
    if (!lvl || !(lvl.group in inner)) continue;
    inner[lvl.group]++;
    for (const [s, n] of Object.entries(lvl.points ?? {}) as [StatId, number][]) {
      if (n) points[s] = (points[s] ?? 0) + n;
    }
  }
  return { inner, points };
}

// The Build as it's exported: no undefined or empty optional fields.
export function toBuild(draft: Draft): Record<string, unknown> {
  const { inner, points, ...rest } = draft;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...rest, levels: poolToLevels(inner, points) })) {
    if (value === undefined || value === "") continue;
    out[key] = value;
  }
  return out;
}

const array = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

// Takes any object shaped roughly like a Build. Fields are kept as they are,
// so the engine can report what's wrong with them.
export function fromBuild(input: unknown): Draft {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("A build is a JSON object");
  }
  const b = input as Record<string, unknown>;
  const levels = array<LevelAllocation>(b.levels);
  const level = typeof b.level === "number" ? b.level : Math.max(1, levels.length);
  // The Tatot used to be one Kind with an orcoid or goblinoid form; it's two Kinds now.
  const kind = b.kind === "tatot" && (b.form === "orcoid" || b.form === "goblinoid") ? `tatot-${b.form}` : text(b.kind);
  return {
    name: text(b.name),
    kind,
    origin: text(b.origin),
    profession: text(b.profession),
    past: text(b.past),
    ...(b.startPoints && typeof b.startPoints === "object" && Object.keys(b.startPoints).length
      ? { startPoints: b.startPoints as Partial<Record<StatId, number>> }
      : {}),
    level,
    ...levelsToPool(levels),
    traits: array<TraitPick>(b.traits).map((t) => ({ ...t, rank: t.rank ?? 1 })),
    choices: array<ChoiceAnswer>(b.choices),
  };
}

// A new starting level. Inner Ring points past it come off Mental first, then
// Social, then Physical, along with any Outer Ring points they unlocked.
export function withLevel(draft: Draft, level: number): Draft {
  let next: Draft = { ...draft, level };
  for (const g of [...POOL_GROUPS].reverse()) {
    while (next.inner[g] > 0 && POOL_GROUPS.reduce((n, x) => n + next.inner[x], 0) > level) {
      next = withInner(next, g, next.inner[g] - 1);
    }
  }
  return next;
}

// Sets a group's Inner Ring points, taking back Outer Ring points it can no
// longer hold, from the group's last stat first.
export function withInner(draft: Draft, group: StatGroup, count: number): Draft {
  const points = { ...draft.points };
  let over = STAT_GROUPS[group].reduce((n, s) => n + (points[s] ?? 0), 0) - count * OUTER_POINTS_PER_LEVEL;
  for (const s of [...STAT_GROUPS[group]].reverse()) {
    if (over <= 0) break;
    const take = Math.min(over, points[s] ?? 0);
    points[s] = (points[s] ?? 0) - take;
    if (!points[s]) delete points[s];
    over -= take;
  }
  return { ...draft, inner: { ...draft.inner, [group]: count }, points };
}

export function addPick(draft: Draft, trait: string, rank: number, pick: PickKind): Draft {
  return { ...draft, traits: [...draft.traits, { trait, rank, pick }] };
}

const KEY = "sf-character-builder:v1";

export function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const saved = JSON.parse(raw) as Partial<Saved>;
    const draft = fromBuild(saved.draft);
    const startingLevel = saved.campaign?.startingLevel ?? draft.level;
    // The Stats step used to be called Levels.
    const savedStep = (saved.step as string) === "levels" ? "stats" : saved.step;
    const step = STEPS.includes(savedStep as Step) ? (savedStep as Step) : "character";
    const ai = saved.ai && Array.isArray(saved.ai.reasons) ? saved.ai : undefined;
    return { draft, campaign: { startingLevel }, step, ai };
  } catch {
    return EMPTY;
  }
}

export function save(saved: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage can be full or blocked; the build still works, it just won't persist.
  }
}

export function clearSaved() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
