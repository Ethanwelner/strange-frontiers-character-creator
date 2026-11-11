// A character in play: the build from the Character Creator, plus what
// changes at the table (current HP, VP, SP and MP, items, temporary
// Conditions, the chat with the assistant). The build itself stays a Build,
// so the engine checks it and works out its stats, resources and Traits.
import type { Content } from "../engine/parse.js";
import { bonusPointsOf, FOCUS_POINTS_PER_LEVEL, validateBuild, type BuildResult } from "../engine/validate.js";
import { STAT_GROUPS } from "../schema/index.js";
import { fromBuild, toBuild, type Draft } from "../app/draft.js";
import { readItems, withItem, withoutItem, type Item } from "../app/items.js";
import { readConditions, withCondition, withoutCondition, type HeldCondition } from "../app/conditions.js";

export { ITEM_CATEGORIES, type Item, type ItemCategory } from "../app/items.js";
export { HP_CONDITIONS, hpConditions, playConditions, type HeldCondition } from "../app/conditions.js";

// HP, VP, SP and MP, and an AI Core's core HP, apart from its chassis's.
export const RESOURCES = ["hp", "vp", "sp", "mp", "core"] as const;
export type ResourceKey = (typeof RESOURCES)[number];

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

// An established character's build is checked at its own level: the
// campaign's starting level only matters at creation. The play's items count,
// so an AI Core's inhabited chassis gives it its Physical stats and HP.
export function checkPlay(draft: Draft, content: Content, items?: Item[]): BuildResult {
  return validateBuild(toBuild(items ? { ...draft, items } : draft), content, { startingLevel: draft.level, kit: false });
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
  if (r === "core") return result.summary?.coreHp ?? 0;
  return result.summary?.resources[r] ?? 0;
}

// The resources a character has: MP once it has any, core HP for a Kind with
// a core (the AI Core), and HP only while that Kind is in a chassis: a
// bodiless AI Core has its core's HP alone.
export function shownResources(result: BuildResult): ResourceKey[] {
  const bodiless = Boolean(result.summary?.coreHp) && !result.summary?.chassis;
  return RESOURCES.filter((r) => (r === "hp" ? !bodiless : (r !== "mp" && r !== "core") || maxOf(result, r) > 0));
}

// The item an AI Core inhabits, from the check: its HP are the character's.
export function inhabitedChassis(play: Play, result: BuildResult): Item | undefined {
  const id = result.summary?.chassis?.item;
  return id ? play.items.find((i) => i.equipped && i.item === id) : undefined;
}

export function currentOf(play: Play, result: BuildResult, r: ResourceKey): number {
  const chassis = r === "hp" ? inhabitedChassis(play, result) : undefined;
  if (chassis) return chassis.hp ?? maxOf(result, r);
  return play.current[r] ?? maxOf(result, r);
}

// Current values stop at 0 (HP can go below: Dead is "0 or less") but can go
// above the max, for bonus points given to a character. A value at the max is
// stored as missing, so a level up that raises the max keeps the character full.
export function withResource(play: Play, result: BuildResult, r: ResourceKey, value: number): Play {
  const max = maxOf(result, r);
  const v = r === "hp" || r === "core" ? Math.round(value) : Math.max(0, Math.round(value));
  // An AI Core's HP are its inhabited chassis's, kept on the chassis
  const chassis = r === "hp" ? inhabitedChassis(play, result) : undefined;
  if (chassis) {
    const { hp: _hp, ...rest } = chassis;
    return { ...play, items: play.items.map((i) => (i === chassis ? (v === max ? rest : { ...rest, hp: v }) : i)) };
  }
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

// The build as a file, with the items and Conditions the character has now.
export function playBuild(play: Play): Record<string, unknown> {
  return toBuild({ ...play.draft, items: play.items, conditions: play.conditions });
}

// Taking a Condition again raises its rank if it's ranked, or does nothing.
export function addCondition(play: Play, content: Content, trait: string, rank = 1, note?: string): Play {
  const conditions = withCondition(play.conditions, content, trait, rank, note);
  return conditions === play.conditions ? play : { ...play, conditions };
}

export function removeCondition(play: Play, trait: string): Play {
  return { ...play, conditions: withoutCondition(play.conditions, trait) };
}

// The Kit Points a new character had left become starting cash, in its
// Origin's currency, the first time it goes into play, and only then
// (kitCashed). Checked with the starting-kit rules, as at creation.
export function withStartingCash(play: Play, content: Content): Play {
  if (play.draft.kitCashed) return play;
  const draft = { ...play.draft, kitCashed: true };
  const kit = validateBuild(toBuild({ ...play.draft, items: play.items }), content, { startingLevel: play.draft.level }).summary?.kit;
  if (!kit || kit.cash.amount <= 0) return { ...play, draft };
  const stock = content.items.find((i) => i.id === (kit.cash.currency === "Luras" ? "luras" : "earth-reserve-credits"));
  const cash = { ...(stock ? { item: stock.id } : {}), name: stock?.name ?? kit.cash.currency, qty: kit.cash.amount, category: "currency" as const, equipped: false };
  return { ...play, draft, items: withItem(play.items, cash) };
}

// A new session for an imported build: full resources, carrying the build's
// items and Conditions. From then on the play's own are the ones that count.
export function startPlay(build: unknown): Play {
  const { items = [], conditions = [], ...draft } = fromBuild(build);
  return { draft, current: {}, items, conditions, chat: [] };
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
      conditions: readConditions(saved.conditions),
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
