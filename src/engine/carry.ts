// Carry weight and encumbrance. A character carries 20 kg plus 10 kg per
// point of its Physical core stat (an AI Core's comes from its chassis).
// Its equipped items' weight against that sets one of four encumbrance
// Conditions, as HP sets the HP Conditions:
//
//   Unencumbered        half the carry weight or less   no effect
//   Lightly Encumbered  more than half, up to all of it  -1 Priority
//   Encumbered          more than it, up to double it    Movement halved, -1 Priority
//   Heavily Encumbered  more than double it             can't move, -1 Priority
//
// Items carry their weight per bundle (a quiver of 20 Arrows), and a counted
// item's count is in units, so it weighs its share of a bundle per unit.

export const CARRY_BASE = 20;
export const CARRY_PER_PHYSICAL = 10;

export const ENCUMBRANCE = ["unencumbered", "lightly-encumbered", "encumbered", "heavily-encumbered"] as const;
export type Encumbrance = (typeof ENCUMBRANCE)[number];

// The carry weight, in kg, for a Physical core stat.
export const carryWeight = (physical: number) => CARRY_BASE + CARRY_PER_PHYSICAL * Math.max(0, physical);

// The encumbrance Condition for `load` kg carried against `limit` kg.
export function encumbrance(load: number, limit: number): Encumbrance {
  if (load > 2 * limit) return "heavily-encumbered";
  if (load > limit) return "encumbered";
  if (load > limit / 2) return "lightly-encumbered";
  return "unencumbered";
}

// What one held item adds to the load: nothing unless it's equipped or has
// no weight; a counted item its units' share of the bundle weight.
export function itemLoad(item: { qty: number; equipped: boolean; category: string }, stock?: { weight?: number; bundle?: number }): number {
  if (!item.equipped || stock?.weight === undefined) return 0;
  return item.category === "consumable" ? (stock.weight * item.qty) / (stock.bundle ?? 1) : stock.weight * item.qty;
}

// What a stock item tells carry weight: its weight, bundle, tags (a shield's
// `shield`) and the carry fields some items have.
export interface CarryStock {
  weight?: number;
  bundle?: number;
  tags?: string[];
  carryBonus?: number;
  carriesItself?: boolean;
  holdsItems?: number;
}

export interface CarryResult {
  load: number;
  limit: number;
  state: Encumbrance;
  // Beast of Burden: still moves while Heavily Encumbered, at a quarter
  beastOfBurden: boolean;
}

// The load, carry weight and encumbrance Condition for a character with
// `physical` Physical, its items (each with its stock entry) and its held
// Traits. Traits and items that change carry weight stack:
//   Armor Training   equipped Armor but shields counts half; none at Rank 2+
//   Arms Bearer      equipped Weapons don't count
//   Shield Bearer    equipped shields don't count
//   Pack Mule        +10 kg carry weight per Rank
//   Beast of Burden  moves at a quarter of its Movement when Heavily Encumbered
//   items            carryBonus adds carry weight; carriesItself doesn't count;
//                    holdsItems: that many equipped Gear items don't count
export function carryOf(
  physical: number,
  items: { qty: number; equipped: boolean; category: string; stock?: CarryStock }[],
  held: { trait: string; rank: number }[] = [],
): CarryResult {
  const rank = (id: string) => held.find((h) => h.trait === id)?.rank ?? 0;
  const armorRank = rank("armor-training");
  const equipped = items.filter((i) => i.equipped);
  const isShield = (i: (typeof items)[number]) => i.category === "armor" && (i.stock?.tags ?? []).includes("shield");
  const share = (i: (typeof items)[number]) => {
    if (i.stock?.carriesItself) return 0;
    if (i.category === "weapon" && rank("arms-bearer")) return 0;
    if (isShield(i)) return rank("shield-bearer") ? 0 : 1;
    if (i.category === "armor" && armorRank) return armorRank >= 2 ? 0 : 0.5;
    return 1;
  };
  // Gear a holder (a Bottomless Satchel) keeps, the heaviest first
  const holds = equipped.reduce((n, i) => n + (i.stock?.holdsItems ?? 0) * i.qty, 0);
  const inHolder = new Set(
    equipped
      .filter((i) => i.category === "gear" && !i.stock?.holdsItems && !i.stock?.carriesItself)
      .sort((a, b) => itemLoad(b, b.stock) - itemLoad(a, a.stock))
      .slice(0, holds),
  );
  const load = equipped.reduce((n, i) => n + (inHolder.has(i) ? 0 : itemLoad(i, i.stock) * share(i)), 0);
  const bonus = equipped.reduce((n, i) => n + (i.stock?.carryBonus ?? 0) * i.qty, 0);
  const limit = carryWeight(physical) + 10 * rank("pack-mule") + bonus;
  return { load, limit, state: encumbrance(load, limit), beastOfBurden: rank("beast-of-burden") > 0 };
}

// Movement under an encumbrance Condition: halved when Encumbered, 0 when
// Heavily Encumbered (a quarter with Beast of Burden), as it is otherwise.
// Keeps the unit: "10 m" halves to "5 m". Movement it can't read stays as it is.
export function movementUnder(movement: string, state: Encumbrance, beastOfBurden = false): string {
  if (state !== "encumbered" && state !== "heavily-encumbered") return movement;
  const m = movement.match(/^\s*([\d.]+)\s*(.*)$/);
  if (!m) return movement;
  const n = state === "heavily-encumbered" ? (beastOfBurden ? Number(m[1]) / 4 : 0) : Number(m[1]) / 2;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${m[2]}`.trim();
}

// Rounds a load to tenths, for showing: 12.35 is 12.4.
export const kg = (n: number) => Math.round(n * 10) / 10;
