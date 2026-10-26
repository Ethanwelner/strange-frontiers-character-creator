import { z } from "zod";

const PHYSICAL = ["endurance", "power", "grace"] as const;
const SOCIAL = ["empathy", "persuasion", "demeanor"] as const;
const MENTAL = ["logic", "intuition", "memory"] as const;

export const StatId = z.enum([...PHYSICAL, ...SOCIAL, ...MENTAL]);
export type StatId = z.infer<typeof StatId>;

// Core stats, each with the focus stats it unlocks. Magic has none: each point
// in it adds MP instead, and only characters with a Trait that opens it
// (coreAccess) can level it.
export const STAT_GROUPS: Record<"physical" | "social" | "mental" | "magic", readonly StatId[]> = {
  physical: PHYSICAL,
  social: SOCIAL,
  mental: MENTAL,
  magic: [],
};

// The core stats every character can level; the others need a Trait.
export const OPEN_CORE_STATS = ["physical", "social", "mental"] as const;

// HP, VP, SP and MP, as Kinds and Traits add to them.
export const Resources = z.object({ hp: z.number().int(), vp: z.number().int(), sp: z.number().int(), mp: z.number().int() }).partial();
export type Resources = z.infer<typeof Resources>;

// Focus stats can't be raised above 20 without Traits or equipment.
export const STAT_CAP = 20;

export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be kebab-case");

export const Status = z.enum(["placeholder", "draft", "final"]);

const BaseEntry = z.object({
  id: Id,
  name: z.string().min(1),
  status: Status,
  plane: z.string().min(1),
  region: z.string().optional(),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  lore: z.string().optional(),
});

export const StatRange = z
  .object({
    bonus: z.number().int().min(0),
    max: z.number().int().min(0).max(STAT_CAP),
  })
  .refine((r) => r.bonus <= r.max, "bonus can't exceed max");

// Every focus stat must be listed.
export const StatBlock = z.record(StatId, StatRange);
export type StatBlock = z.infer<typeof StatBlock>;

// A named ability a Kind or package grants. Effects stay prose until the
// rules engine needs to act on them.
export const Feature = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

// A reference to a Trait, by id, with an optional starting rank.
export const TraitGrant = z.object({
  trait: Id,
  rank: z.number().int().min(1).optional(),
});

// "Pick N from a pool", e.g. one additional Contact or one Dreftian language.
// Packages and Traits both ask them. A ranked Trait asks again at each rank
// unless `perRank` is false, as with Seafaring's "Which seas".
export const TraitChoice = z.object({
  choose: z.number().int().min(1),
  from: z.string().min(1),
  note: z.string().optional(),
  perRank: z.boolean().optional(),
});
export type TraitChoice = z.infer<typeof TraitChoice>;

export const Kind = BaseEntry.extend({
  features: z.array(Feature).default([]),
  // Traits every character of this Kind holds, like the Isek's Magical
  // Heritage. They don't use picks.
  grants: z.array(TraitGrant).default([]),
  // Added to the character's HP, VP, SP or MP, like the Goblinoid Tatot's MP.
  resources: Resources.default({}),
  // Trait pools this Kind gets easier access to.
  traitAccess: z.array(z.string()).default([]),
  stats: StatBlock,
  // Bonus points the player places in any stats, on top of the Kind's
  // bonuses. Maximums still apply. No Kind uses them right now; packages'
  // bonusPoints work the same way, limited to one group.
  freePoints: z.number().int().min(0).default(0),
  // What this Kind's stat maximums add up to, when it's deliberately off
  // Human's 135, like the AI Core's 120. The validator checks against it.
  maxTotal: z.number().int().min(0).optional(),
});
export type Kind = z.infer<typeof Kind>;

export const PackageType = z.enum(["origin", "profession", "past"]);

// Bonus points a package gives the player to place, each in one of a group's
// focus stats, like the American Empire's 1 Physical point.
export const BonusPoints = z.object({
  count: z.number().int().min(1),
  group: z.enum(OPEN_CORE_STATS),
});
export type BonusPoints = z.infer<typeof BonusPoints>;

export const BackgroundPackage = BaseEntry.extend({
  type: PackageType,
  grants: z.array(TraitGrant).default([]),
  bonusPoints: z.array(BonusPoints).default([]),
  // Points added straight to a core stat, without a level, like the Licensed
  // Mage's 1 Magic. They count only if the character can level that stat.
  // Only Magic for now: a bonus to a stat with focus stats would also need
  // the focus points it unlocks.
  coreBonus: z.partialRecord(z.enum(["magic"]), z.number().int().min(1)).default({}),
  choices: z.array(TraitChoice).default([]),
  // Traits this package puts on the character's Background Trait list.
  backgroundTraits: z.array(Id).default([]),
  features: z.array(Feature).default([]),
});
export type BackgroundPackage = z.infer<typeof BackgroundPackage>;

export const TraitCategory = z.enum([
  "knowledge",
  "skill",
  "contact",
  "starter",
  "ability",
  "condition",
  "membership",
  "circumstance",
  "other",
]);

// The lowest stats a character needs to take a Trait: focus stats by name
// (power: 3) and core stats by group (physical: 5).
export const MinStats = z
  .object(
    Object.fromEntries(
      [...StatId.options, ...Object.keys(STAT_GROUPS)].map((k) => [k, z.number().int().min(0).optional()]),
    ) as Record<StatId | keyof typeof STAT_GROUPS, z.ZodOptional<z.ZodNumber>>,
  )
  .strict();
export type MinStats = z.infer<typeof MinStats>;

export const Trait = BaseEntry.extend({
  category: TraitCategory,
  // Types like supernatural, injury or cybernetic, which other effects target.
  types: z.array(z.string()).default([]),
  ranked: z.boolean().default(false),
  // Each listed stat must be at least 3 × the new rank to rank up past 1.
  rankStats: z.array(StatId).default([]),
  // Needed to take the Trait at all, before any rank.
  minStats: MinStats.default({}),
  prerequisites: z.array(Id).default([]),
  // Each tag needs at least one held Trait carrying it, e.g. Expert Pilot's
  // "any Pilot skill" is `pilot`.
  prerequisiteTags: z.array(z.string()).default([]),
  background: z.boolean().default(false),
  starterOnly: z.boolean().default(false),
  // A Mastery Trait, like Expert Pilot: the top of a line of Traits.
  mastery: z.boolean().default(false),
  // For a temporary Trait, when it ends, e.g. "Lost when the bleeding is treated".
  temporary: z.string().optional(),
  // Conveyed Traits come from packages, choices or play, never from a level-up pick.
  conveyed: z.boolean().default(false),
  rpRequirement: z.string().optional(),
  effect: z.string().min(1),
  // For a language Trait, which language it's a form of: Dreftan (Spoken) and
  // Dreftan (Written) are both `dreftan`.
  language: z.string().optional(),
  // Asked when the Trait is held, e.g. which language an Additional Language
  // is. A ranked Trait asks again for each rank.
  choices: z.array(TraitChoice).default([]),
  // Added to the character's HP, VP, SP or MP for each rank held.
  resources: Resources.default({}),
  // Core stats beyond Physical, Social and Mental that holding this Trait
  // lets a character level, like Magic Access's Magic.
  coreAccess: z.array(z.enum(["magic"])).default([]),
  // Trait lists: a Trait on a list (like Incantation on `magic`) can only be
  // picked by a character holding a Trait that opens that list (like
  // Magic Access). Lists are named freely; each is its own tab on the
  // Traits step.
  list: z.string().optional(),
  opensLists: z.array(z.string()).default([]),
  // Traits holding this one conveys, like Magical Heritage's Magic Access,
  // held for as long as this one is, from whatever source.
  grants: z.array(TraitGrant).default([]),
});
export type Trait = z.infer<typeof Trait>;
