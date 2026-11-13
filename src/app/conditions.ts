// The temporary Conditions a character has, shared by the Character
// Creator's sheet and Player Tools. They travel in the build as
// `conditions` (BuildCondition in engine/build.ts), like the items.
import type { Content } from "../engine/parse.js";
import { ENCUMBRANCE } from "../engine/carry.js";

// A temporary Condition Trait the character has picked up, like Severe
// Bleeding or Irradiated (2).
export interface HeldCondition {
  trait: string;
  rank: number;
  note?: string;
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

// The Conditions the carried weight decides on its own (engine/carry.ts)
export { ENCUMBRANCE };

// Temporary Conditions a character can pick up: conveyed Condition Traits
// that end, minus the ones HP and carried weight decide and the ones for
// objects.
export function playConditions(content: Content) {
  const decided = new Set<string>([...HP_CONDITIONS, ...ENCUMBRANCE]);
  return content.traits
    .filter((t) => t.category === "condition" && t.temporary && !decided.has(t.id))
    .filter((t) => !/\bobject\b/i.test(t.temporary ?? "") || /\bcharacter\b/i.test(t.temporary ?? ""))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The kinds of Condition Add a Condition filters by, read from each one's
// tags: Injury, Hazard (fire, acid, cold, radiation and the like), Magic
// (spells and enchantments), Combat, and Misc for anything none of those
// cover. A Condition can be more than one (Irradiated is an Injury and a
// Hazard).
export const CONDITION_TYPES = ["injury", "hazard", "magic", "combat", "misc"] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export function conditionTypes(t: { tags?: string[] }): ConditionType[] {
  const tags = t.tags ?? [];
  const types: ConditionType[] = [];
  if (tags.includes("injury")) types.push("injury");
  if (tags.includes("hazard")) types.push("hazard");
  if (tags.includes("magic") || tags.includes("enchantment")) types.push("magic");
  if (tags.includes("combat")) types.push("combat");
  return types.length ? types : ["misc"];
}

// Taking a Condition again raises its rank if it's ranked, or does nothing.
export function withCondition(conditions: HeldCondition[], content: Content, trait: string, rank = 1, note?: string): HeldCondition[] {
  const t = content.traits.find((x) => x.id === trait);
  const held = conditions.find((c) => c.trait === trait);
  if (held) {
    if (!t?.ranked) return conditions;
    return conditions.map((c) => (c === held ? { ...c, rank: c.rank + rank, note: note ?? c.note } : c));
  }
  return [...conditions, { trait, rank: t?.ranked ? rank : 1, ...(note ? { note } : {}) }];
}

export function withoutCondition(conditions: HeldCondition[], trait: string): HeldCondition[] {
  return conditions.filter((c) => c.trait !== trait);
}

// Conditions read from a saved build or session, keeping only well-formed ones.
export function readConditions(v: unknown): HeldCondition[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c) => {
    if (!c || typeof c !== "object" || typeof (c as HeldCondition).trait !== "string") return [];
    const { trait, rank, note } = c as HeldCondition;
    return [{ trait, rank: typeof rank === "number" && rank >= 1 ? Math.floor(rank) : 1, ...(typeof note === "string" && note ? { note } : {}) }];
  });
}
