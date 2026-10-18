import { z } from "zod";

// Outer Ring stats, grouped under the Inner Ring stat they belong to.
export const STAT_GROUPS = {
  physical: ["endurance", "power", "grace"],
  social: ["empathy", "persuasion", "demeanor"],
  mental: ["logic", "intuition", "memory"],
} as const;

export const StatId = z.enum([
  ...STAT_GROUPS.physical,
  ...STAT_GROUPS.social,
  ...STAT_GROUPS.mental,
]);
export type StatId = z.infer<typeof StatId>;

// Outer Ring stats can't be raised above 20 without Traits or equipment.
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
    start: z.number().int().min(0),
    max: z.number().int().min(0).max(STAT_CAP),
  })
  .refine((r) => r.start <= r.max, "start can't exceed max");

// Every Outer Ring stat must be listed.
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
export const TraitChoice = z.object({
  choose: z.number().int().min(1),
  from: z.string().min(1),
  note: z.string().optional(),
});

// A Kind with several fixed forms, like the Tatot's orcoid and goblinoid
// births. The player picks one at character creation.
export const KindForm = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().min(1),
  stats: StatBlock,
  features: z.array(Feature).default([]),
});

export const Kind = BaseEntry.extend({
  features: z.array(Feature).default([]),
  // Trait pools this Kind gets easier access to.
  featAccess: z.array(z.string()).default([]),
  stats: StatBlock.optional(),
  forms: z.array(KindForm).optional(),
}).refine(
  (k) => (k.stats === undefined) !== (k.forms === undefined),
  "a Kind has either stats or forms, not both",
);
export type Kind = z.infer<typeof Kind>;

export const PackageType = z.enum(["origin", "profession", "past"]);

export const BackgroundPackage = BaseEntry.extend({
  type: PackageType,
  grants: z.array(TraitGrant).default([]),
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
  "condition",
  "membership",
]);

export const Trait = BaseEntry.extend({
  category: TraitCategory,
  // Types like supernatural, injury or cybernetic, which other effects target.
  types: z.array(z.string()).default([]),
  ranked: z.boolean().default(false),
  // Each listed stat must be at least 3 × the new rank to rank up past 1.
  rankStats: z.array(StatId).default([]),
  prerequisites: z.array(Id).default([]),
  background: z.boolean().default(false),
  starterOnly: z.boolean().default(false),
  rpRequirement: z.string().optional(),
  effect: z.string().min(1),
});
export type Trait = z.infer<typeof Trait>;
