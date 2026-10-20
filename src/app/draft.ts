// The in-progress build the UI edits, and saving it. A draft is a Build that
// may not be finished: the engine checks it as-is and says what's missing.
import type { ChoiceAnswer, LevelAllocation, PickKind, TraitPick } from "../engine/build.js";
import type { Campaign } from "../engine/build.js";
import type { DescribeResult, OpenChoice, Reason } from "../ai/types.js";

export interface Draft {
  name?: string;
  kind?: string;
  origin?: string;
  profession?: string;
  past?: string;
  level: number;
  levels: LevelAllocation[];
  traits: TraitPick[];
  choices: ChoiceAnswer[];
}

export const STEPS = ["kind", "background", "stats", "choices", "traits", "sheet"] as const;
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

export const emptyLevel = (): LevelAllocation => ({ group: "physical", points: {} });

export const EMPTY: Saved = {
  draft: { level: 1, levels: [emptyLevel()], traits: [], choices: [] },
  campaign: { startingLevel: 1 },
  step: "kind",
};

// The Build as it's exported: no undefined or empty optional fields.
export function toBuild(draft: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
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
    level,
    levels,
    traits: array<TraitPick>(b.traits).map((t) => ({ ...t, rank: t.rank ?? 1 })),
    choices: array<ChoiceAnswer>(b.choices),
  };
}

// Resizes the level allocations to match a new starting level.
export function withLevel(draft: Draft, level: number): Draft {
  const levels = draft.levels.slice(0, level);
  while (levels.length < level) levels.push(emptyLevel());
  return { ...draft, level, levels };
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
    const step = STEPS.includes(savedStep as Step) ? (savedStep as Step) : "kind";
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
