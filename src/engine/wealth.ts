// Wealth at character creation. Players don't handle currency while they
// build a character: each item has a Kit Cost, worked out from its value in
// bands of ten, and the character's Wealth sets how many Kit Points it can
// spend on its starting items (its budget) and the dearest item it can start
// with (its ceiling). What's left becomes starting cash in its Origin's
// currency once it's in play. Wealth comes from the Origin, Profession and
// Past, and from Traits, and stays on the sheet as a rating afterwards. A
// character made above level 1 has had a lifetime to gather things, so its
// kit is bought with more: its kit Wealth adds 1 for every 5 levels.
import type { Item } from "../schema/index.js";

export const WEALTH_MIN = -1;
export const WEALTH_MAX = 4;

// What one of each currency is worth in ERC, roughly: Kit Costs come in bands
// of ten, so a rate only has to be in the right range. Imperial Dollars and
// Rénmínbì have no rate yet and count as ERC.
export const ERC_PER: Record<string, number> = { ERC: 1, Luras: 10 };

// Kit Cost 0 (Basic) is under 100 ERC, 1 under 1,000, 2 under 10,000, 3
// under 100,000, 4 under 1,000,000, and 5 anything dearer.
const BANDS = [100, 1_000, 10_000, 100_000, 1_000_000];

// Money a character holds, by currency: the stock currency items' ids and
// the short names the sheet's cash badge uses.
export const CURRENCY_OF_ITEM: Record<string, string> = { "earth-reserve-credits": "ERC", luras: "Luras", "imperial-dollars": "ID", renminbi: "RMB" };

// An AI Core's first chassis is free up to this Kit Cost.
export const FREE_CHASSIS_COST = 3;

// Each Kit Point left over is this many ERC of starting cash.
export const CASH_PER_POINT_ERC = 100;

export function kitCostOf(item: Item): number {
  if (item.kitCost !== undefined) return item.kitCost;
  if (item.value === undefined) return 0;
  const erc = item.value * (ERC_PER[item.currency ?? "ERC"] ?? 1);
  const band = BANDS.findIndex((limit) => erc < limit);
  return band === -1 ? BANDS.length : band;
}

export const clampWealth = (n: number) => Math.max(WEALTH_MIN, Math.min(WEALTH_MAX, n));

// What a character's level adds to the Wealth its starting kit is bought
// with: +1 at levels 5 to 9, +2 at 10 to 14, +3 at 15 to 19, +4 at 20.
export const LEVELS_PER_KIT_WEALTH = 5;
export const levelKitWealth = (level: number) => Math.max(0, Math.floor(level / LEVELS_PER_KIT_WEALTH));

// Kit Points to spend on starting items: 3 + 2 × Wealth (kit Wealth, with
// the level's bonus)
export const kitBudget = (wealth: number) => Math.max(0, 3 + 2 * wealth);

// The dearest Kit Cost a starting item can have: Wealth + 1 (kit Wealth)
export const kitCeiling = (wealth: number) => Math.max(0, wealth + 1);

// Starting cash for points left over, in a currency: Luras for an Isekai
// Origin, ERC otherwise
export function startingCash(points: number, currency: string): number {
  return Math.floor((points * CASH_PER_POINT_ERC) / (ERC_PER[currency] ?? 1));
}
