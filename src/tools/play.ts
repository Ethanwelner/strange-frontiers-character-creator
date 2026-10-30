// A character in play: the build from the Character Creator, plus what
// changes at the table (current HP, VP, SP and MP, items, temporary
// Conditions, the chat with the assistant). The build itself stays a Build,
// so the engine checks it and works out its stats, resources and Traits.
import type { Content } from "../engine/parse.js";
import { bonusPointsOf, FOCUS_POINTS_PER_LEVEL, validateBuild, type BuildResult } from "../engine/validate.js";
import { STAT_GROUPS } from "../schema/index.js";
import { fromBuild, toBuild, type Draft } from "../app/draft.js";
import { readItems, withItem, withoutItem, type Item } from "../app/items.js";

export { ITEM_CATEGORIES, type Item, type ItemCategory } from "../app/items.js";

export const RESOURCES = ["hp", "vp", "sp", "mp"] as const;
export type ResourceKey = (typeof RESOURCES)[number];

// A temporary Condition Trait the character has picked up in play, like
// Severe Bleeding or Irradiated (2).
export interface HeldCondition {
  trait: string;
  rank: number;
  note?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  // What the assistant changed on the tracker while answering, said plainly.
  changes?: string[];
}

export interface Play {
  draft: Draft;
  // Missing means full.
  current: Partial<Record<ResourceKey, number>>;
  items: Item[];
  conditions: HeldCondition[];
  chat: ChatMessage[];
}

// The Conditions HP decides on its own, in the order they're shown.
export const HP_CONDITIONS = ["healthy", "injured", "severely-injured", "incapacitated", "dead"] as const;

// The HP Conditions that apply at `hp` of `max`, following their Traits'
// own wording: Healthy at max, Injured below it, Severely Injured below
// half, Incapacitated below a quarter, Dead at 0 or less.
export function hpConditions(hp: number, max: number): string[] {
  if (hp <= 0) return ["dead"];
  if (hp >= max) return ["healthy"];
  return ["injured", ...(hp < max / 2 ? ["severely-injured"] : []), ...(hp < max / 4 ? ["incapacitated"] : [])];
}

// Temporary Conditions a character can pick up in play: conveyed Condition
// Traits that end, minus the ones HP decides and the ones for objects.
export function playConditions(content: Content) {
  return content.traits
    .filter((t) => t.category === "condition" && t.temporary && !(HP_CONDITIONS as readonly string[]).includes(t.id))
    .filter((t) => !/\bobject\b/i.test(t.temporary ?? "") || /\bcharacter\b/i.test(t.temporary ?? ""))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// An established character's build is checked at its own level: the
// campaign's starting level only matters at creation.
export function checkPlay(draft: Draft, content: Content): BuildResult {
  return validateBuild(toBuild(draft), content, { startingLevel: draft.level });
}

// Whether a character has stat points left to place: a core point per level,
// each core point's focus points, and the free bonus points its Kind and
// packages give. Player Tools opens the Stats step while any are left.
export function pointsToPlace(draft: Draft, content: Content): boolean {
  const groups = Object.keys(STAT_GROUPS) as (keyof typeof STAT_GROUPS)[];
  if (groups.reduce((n, g) => n + draft.core[g], 0) < draft.level) return true;
  const spent = (g: keyof typeof STAT_GROUPS) => STAT_GROUPS[g].reduce((n, s) => n + (draft.points[s] ?? 0), 0);
  if (groups.some((g) => STAT_GROUPS[g].length && spent(g) < draft.core[g] * FOCUS_POINTS_PER_LEVEL)) return true;
  const kind = content.kinds.find((k) => k.id === draft.kind);
  const packages = content.packages.filter((p) => [draft.origin, draft.profession, draft.past].includes(p.id));
  const bonus = bonusPointsOf(kind, packages);
  const start = draft.startPoints ?? {};
  const placedIn = (g: keyof typeof STAT_GROUPS) => STAT_GROUPS[g].reduce((n, s) => n + (start[s] ?? 0), 0);
  const placed = Object.values(start).reduce((n, p) => n + (p ?? 0), 0);
  const inGroups = bonus.groups.reduce((n, b) => n + Math.min(placedIn(b.group), b.count), 0);
  return bonus.groups.some((b) => placedIn(b.group) < b.count) || placed - inGroups < bonus.any;
}

export function maxOf(result: BuildResult, r: ResourceKey): number {
  return result.summary?.resources[r] ?? 0;
}

export function currentOf(play: Play, result: BuildResult, r: ResourceKey): number {
  return play.current[r] ?? maxOf(result, r);
}

// Current values are kept between 0 (or below, for HP: Dead is "0 or less")
// and the max. A value at the max is stored as missing, so a level up that
// raises the max keeps the character full.
export function withResource(play: Play, result: BuildResult, r: ResourceKey, value: number): Play {
  const max = maxOf(result, r);
  const v = Math.min(max, r === "hp" ? Math.round(value) : Math.max(0, Math.round(value)));
  const current = { ...play.current };
  if (v === max) delete current[r];
  else current[r] = v;
  return { ...play, current };
}

// Items with the same name stack.
export function addItem(play: Play, item: Omit<Item, "id">): Play {
  return { ...play, items: withItem(play.items, item) };
}

// Removes `qty` of an item, or all of it if `qty` is missing or covers it.
export function removeItem(play: Play, name: string, qty?: number): Play {
  return { ...play, items: withoutItem(play.items, name, qty) };
}

// The build as a file, with the items the character carries now.
export function playBuild(play: Play): Record<string, unknown> {
  return toBuild({ ...play.draft, items: play.items });
}

// Taking a Condition again raises its rank if it's ranked, or does nothing.
export function addCondition(play: Play, content: Content, trait: string, rank = 1, note?: string): Play {
  const t = content.traits.find((x) => x.id === trait);
  const held = play.conditions.find((c) => c.trait === trait);
  if (held) {
    if (!t?.ranked) return play;
    return { ...play, conditions: play.conditions.map((c) => (c === held ? { ...c, rank: c.rank + rank, note: note ?? c.note } : c)) };
  }
  return { ...play, conditions: [...play.conditions, { trait, rank: t?.ranked ? rank : 1, ...(note ? { note } : {}) }] };
}

export function removeCondition(play: Play, trait: string): Play {
  return { ...play, conditions: play.conditions.filter((c) => c.trait !== trait) };
}

// A new session for an imported build: full resources, carrying the build's
// items. From then on the play's own items are the ones that count.
export function startPlay(build: unknown): Play {
  const { items = [], ...draft } = fromBuild(build);
  return { draft, current: {}, items, conditions: [], chat: [] };
}

const KEY = "sf-game-tools:v1";
// Where the Character Creator keeps the build it's working on.
const CREATOR_KEY = "sf-character-builder:v1";

export function load(): Play | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as Partial<Play>;
    if (!saved.draft) return undefined;
    return {
      draft: fromBuild(saved.draft),
      current: saved.current && typeof saved.current === "object" ? saved.current : {},
      items: readItems(saved.items),
      conditions: Array.isArray(saved.conditions) ? saved.conditions : [],
      chat: Array.isArray(saved.chat) ? saved.chat : [],
    };
  } catch {
    return undefined;
  }
}

export function save(play: Play | undefined) {
  try {
    if (play) localStorage.setItem(KEY, JSON.stringify(play));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be full or blocked; the session still works, it just won't persist.
  }
}

// The build open in the Character Creator, if it has one with a Kind.
export function creatorDraft(): Draft | undefined {
  try {
    const raw = localStorage.getItem(CREATOR_KEY);
    if (!raw) return undefined;
    const draft = fromBuild((JSON.parse(raw) as { draft?: unknown }).draft);
    return draft.kind ? draft : undefined;
  } catch {
    return undefined;
  }
}
