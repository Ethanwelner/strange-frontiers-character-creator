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

// Movement under an encumbrance Condition: halved when Encumbered, 0 when
// Heavily Encumbered, as it is otherwise. Keeps the unit: "10 m" halves to
// "5 m". Movement it can't read stays as it is.
export function movementUnder(movement: string, state: Encumbrance): string {
  if (state !== "encumbered" && state !== "heavily-encumbered") return movement;
  const m = movement.match(/^\s*([\d.]+)\s*(.*)$/);
  if (!m) return movement;
  const n = state === "heavily-encumbered" ? 0 : Number(m[1]) / 2;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${m[2]}`.trim();
}

// Rounds a load to tenths, for showing: 12.35 is 12.4.
export const kg = (n: number) => Math.round(n * 10) / 10;
