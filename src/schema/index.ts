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
  // How characters from it are named. Only the AI builder sees it; players
  // don't. Kinds and Origins use it.
  naming: z.string().optional(),
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
  // How far the Kind moves in a full Movement Action during an Incident, as
  // the Sheet words it, like "10 m" (the default) or "-" for a bodiless AI Core.
  movement: z.string().optional(),
  // A core apart from the body, like the AI Core's Armored Core: an item with
  // its own HP, destroyed separately from its chassis. A Kind with a core
  // inhabits a chassis (an Item with `chassis`), which gives it its Physical
  // stats, HP, Attacks and Traits.
  core: z.object({ hp: z.number().int().min(1) }).optional(),
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
  // Added to the character's Wealth, which sets its starting Kit Points and
  // the dearest item it can start with, like Privileged Upbringing's +2.
  wealth: z.number().int().default(0),
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
  // The Sheet's Keywords: what other effects target (supernatural, injury,
  // cybernetic), potion and artifact, and a spell's school (elemental...).
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
  // Empty for a Trait that only marks a state, like Healthy, which other
  // effects check for.
  effect: z.string().default(""),
  // For a language Trait, which language it's a form of: Dreftan (Spoken) and
  // Dreftan (Written) are both `dreftan`.
  language: z.string().optional(),
  // Asked when the Trait is held, e.g. which language an Additional Language
  // is. A ranked Trait asks again for each rank.
  choices: z.array(TraitChoice).default([]),
  // Added to the character's HP, VP, SP or MP for each rank held.
  resources: Resources.default({}),
  // Added to the character's Wealth, once per rank, like a Family Fortune.
  wealth: z.number().int().default(0),
  // Core stats beyond Physical, Social and Mental that holding this Trait
  // lets a character level, like Magic Access's Magic.
  coreAccess: z.array(z.enum(["magic"])).default([]),
  // Trait lists: the special stat a Trait is built on or closely related to
  // (a special stat among the Sheet's Keywords, like Incantation's `magic`). Each list is its
  // own tab on the Traits step, open to every character; a Trait's stat
  // requirements, like Magic 1, decide who can actually take it.
  list: z.string().optional(),
  // Traits holding this one conveys, like Magical Heritage's Magic Access,
  // held for as long as this one is, from whatever source.
  grants: z.array(TraitGrant).default([]),
  // Changes to Defense, Priority, Movement or Attack Rolls while held, as the
  // Sheet words them, like Flat-Footed's "Priority -1, Attack Rolls -1".
  modifiers: z.string().optional(),
  // A unique Action holding this Trait adds in an Incident.
  action: z.string().optional(),
});
export type Trait = z.infer<typeof Trait>;

// The creator's rough item categories, as the sheet's Items column sorts them.
export const ITEM_CATEGORIES = ["weapon", "armor", "gear", "consumable", "currency", "chassis", "other"] as const;

// The site's Items page categories.
export const ItemType = z.enum(["weapon", "wearable", "equipment", "structure", "vehicle", "animal", "chassis", "misc"]);

// The body an AI Core inhabits, from the Sheet's Chassis tab: its Physical
// core stat and focus stats (core × 3 points), how far it moves, its built-in
// Attacks (stock items, like natural weapons) and the Traits it gives whoever
// inhabits it. Its HP are a character's: 10 plus its Physical focus stats,
// plus its Traits' HP, like Reinforced's.
export const Chassis = z.object({
  core: z.number().int().min(0),
  stats: z.object({ endurance: z.number().int().min(0).max(STAT_CAP), power: z.number().int().min(0).max(STAT_CAP), grace: z.number().int().min(0).max(STAT_CAP) }),
  movement: z.string().optional(),
  attacks: z.array(Id).default([]),
  traits: z.array(Id).default([]),
});
export type Chassis = z.infer<typeof Chassis>;

// A stock item, from the Sheet's Items tab. No item needs a Trait: a related
// Trait only removes the penalty for unfamiliarity.
export const Item = BaseEntry.extend({
  type: ItemType,
  category: z.enum(ITEM_CATEGORIES),
  // The damage it deals, as the Sheet words it: types separated by commas are
  // all dealt at once, options separated by a slash are a choice, like
  // "5 Slashing / 4 Piercing" (app/damage.ts reads it).
  damage: z.string().optional(),
  // What it resists and by how much, as the Sheet words it, in the Items
// page's damage type order, like "3 Blunt, 4 Slashing, 2 Piercing (head)".
  resistances: z.string().optional(),
  // How a weapon Attacks, from the Incidents rules: Melee or Ranged, plus
  // Thrown for a weapon whose Max Range is the thrower's Power × 3.
  attackType: z.enum(["Melee", "Ranged", "Ranged, Thrown"]).optional(),
  // How far it reaches, like "2 m" or "400 m". Thrown weapons leave it out.
  maxRange: z.string().optional(),
  // The Stat added to its Attack Rolls; "Grace / Power" is a choice.
  attackStat: z.string().optional(),
  // The radius it hits every target in, as a Glancing Blow, like "5 m".
  areaOfEffect: z.string().optional(),
  // Reloading it: "Partial" goes with another Action, "Full" takes the Action.
  reload: z.enum(["Partial", "Full"]).optional(),
  // What a hit does beyond damage, by Severity.
  onHit: z.string().optional(),
  // Changes to Defense, Priority, Movement or Attack Rolls, like a shield's
  // "Defense +4 (when Defending)".
  modifiers: z.string().optional(),
  // Limited uses, like "uses 1: when thrown".
  uses: z.string().optional(),
  // The slot only one item can fill at a time, like Body Armor or Headwear.
  slot: z.string().optional(),
  // One value, in the currency of the item's plane of origin.
  value: z.number().int().min(0).optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
  // A chassis: equipped, an AI Core inhabits it.
  chassis: Chassis.optional(),
  // Its Kit Cost at character creation, 0 (Basic) to 5, when it shouldn't be
  // the one its value works out to (engine/wealth.ts).
  kitCost: z.number().int().min(0).max(5).optional(),
});
export type Item = z.infer<typeof Item>;
