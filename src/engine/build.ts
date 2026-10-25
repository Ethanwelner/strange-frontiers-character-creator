import { z } from "zod";
import { Id, StatId, STAT_GROUPS } from "../schema/index.js";

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

export const Build = z.object({
  name: z.string().optional(),
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
});
export type Build = z.infer<typeof Build>;
export type BuildInput = z.input<typeof Build>;

// Per-campaign settings the GM controls.
export interface Campaign {
  startingLevel: number;
}

export const DEFAULT_CAMPAIGN: Campaign = { startingLevel: 3 };
