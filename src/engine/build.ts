import { z } from "zod";
import { Id, ITEM_CATEGORIES, StatId, STAT_GROUPS } from "../schema/index.js";

export { ITEM_CATEGORIES };

// Whether an item is counted: consumables are, in single units (20 Arrows);
// everything else is one of a kind, so two Daggers are two items.
export const isCounted = (item: { category: string }) => item.category === "consumable";

export const StatGroup = z.enum(Object.keys(STAT_GROUPS) as [keyof typeof STAT_GROUPS]);
export type StatGroup = z.infer<typeof StatGroup>;

// What one level adds: 1 core point in `group`, and 3 focus points
// spread among that group's stats.
export const LevelAllocation = z.object({
  group: StatGroup,
  points: z.partialRecord(StatId, z.number().int().min(0)),
});
export type LevelAllocation = z.infer<typeof LevelAllocation>;

export const PickKind = z.enum(["universal", "background"]);
export type PickKind = z.infer<typeof PickKind>;

// One Trait pick spent on a Trait. Each pick buys one rank, so a Trait taken
// from nothing to rank 3 is three entries, with ranks 1, 2 and 3.
export const TraitPick = z.object({
  trait: Id,
  rank: z.number().int().min(1).default(1),
  pick: PickKind,
});
export type TraitPick = z.infer<typeof TraitPick>;

// The answer to one of a package's or a held Trait's `choices`, matched by
// whichever asked (`package` or `trait`) and the pool. `traits` holds Trait
// ids, or for a free-text pool like `contact`, the names the player wrote.
export const ChoiceAnswer = z
  .object({
    package: Id.optional(),
    trait: Id.optional(),
    from: z.string().min(1),
    traits: z.array(z.string().trim().min(1)),
  })
  .refine((a) => (a.package === undefined) !== (a.trait === undefined), "an answer names either a package or a Trait");
export type ChoiceAnswer = z.infer<typeof ChoiceAnswer>;

// What the character carries: a name, a count, a rough category and notes.
// `item` names the stock item it is, from content/items, if it's one; the
// player can write in anything else.
export const BuildItem = z.object({
  id: z.string().optional(),
  item: Id.optional(),
  name: z.string().trim().min(1),
  qty: z.number().int().min(0).default(1),
  category: z.enum(ITEM_CATEGORIES).default("gear"),
  equipped: z.boolean().default(false),
  notes: z.string().optional(),
  // A chassis's HP now (missing is full); it keeps its damage while the AI
  // Core is in another chassis. Cosmetic to the rules check.
  hp: z.number().int().optional(),
  // A counted item whose qty is in single units, as every build since
  // bundles writes (app/items.ts readItems converts older ones).
  units: z.literal(true).optional(),
});
export type BuildItem = z.infer<typeof BuildItem>;

// A temporary Condition the character has, like Severe Bleeding or
// Irradiated (2), with the player's note. Cosmetic to the rules check.
export const BuildCondition = z.object({
  trait: z.string().trim().min(1),
  rank: z.number().int().min(1).default(1),
  note: z.string().optional(),
});
export type BuildCondition = z.infer<typeof BuildCondition>;

export const Build = z.object({
  name: z.string().optional(),
  // Cosmetic details; no rule reads them. Gender left out is Unlisted, and a
  // custom gender is in the player's own words.
  age: z.number().int().min(0).optional(),
  gender: z.enum(["male", "female", "indeterminate", "none", "fluid", "custom"]).optional(),
  customGender: z.string().optional(),
  // Height and weight in the player's own words and units, like 6′1″ or 85 kg.
  height: z.string().optional(),
  weight: z.string().optional(),
  // The character's picture as an image data URL; cosmetic too.
  portrait: z.string().optional(),
  // A free-text description of the character; cosmetic too.
  description: z.string().optional(),
  kind: Id,
  origin: Id,
  profession: Id,
  past: Id,
  // Where the Kind's free bonus points go, if it has any.
  startPoints: z.partialRecord(StatId, z.number().int().min(0)).default({}),
  level: z.number().int().min(1).default(1),
  // One entry per level, starting with level 1.
  levels: z.array(LevelAllocation),
  traits: z.array(TraitPick).default([]),
  choices: z.array(ChoiceAnswer).default([]),
  items: z.array(BuildItem).default([]),
  conditions: z.array(BuildCondition).default([]),
  // The Kit Points left at creation became starting cash when the character
  // first went into play. Cosmetic to the rules check.
  kitCashed: z.boolean().optional(),
  // Money, by currency, like { ERC: 400 }: a badge by the Items title rather
  // than items. Cosmetic to the rules check.
  cash: z.record(z.string(), z.number().int()).optional(),
});
export type Build = z.infer<typeof Build>;
export type BuildInput = z.input<typeof Build>;

// Per-campaign settings the GM controls.
export interface Campaign {
  startingLevel: number;
  // Whether the starting-kit rules apply: Kit Points and the dearest item a
  // character's Wealth allows. True at creation; Player Tools turns them off,
  // since items picked up in play aren't bought from the starting kit.
  kit?: boolean;
}

export const DEFAULT_CAMPAIGN: Campaign = { startingLevel: 3 };
