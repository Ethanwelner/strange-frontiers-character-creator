// A character's resistances to each damage type, added up from every source
// in effect: equipped stock items (their `resistances`, like "1 Blunt,
// 3 Slashing (head)") and the Traits and Conditions whose effect grants
// "Rank *3" resistance. Resistances are cumulative (Mechanics, Resisting
// Damage Types). A resistance limited to a coverage area or a moment, like a
// helmet's (head) or a shield's (when raised), is kept apart from the total.
import type { Content } from "../engine/parse.js";
import type { Item } from "./items.js";
import { stockItemNamed } from "./items.js";
import { DAMAGE_TYPE_GROUPS, DAMAGE_TYPES, type DamageType } from "../engine/damage.js";

export { DAMAGE_TYPE_GROUPS, DAMAGE_TYPES, type DamageType };

export interface Resistance {
  type: DamageType;
  amount: number;
  // Where it applies, when not everywhere: "head", "when raised", "torso"
  where?: string;
  // The item or Trait it comes from
  from: string;
}

const typeNamed = (name: string) => DAMAGE_TYPES.find((t) => t.toLowerCase() === name.trim().toLowerCase());

// "4 Blunt, 3 Slashing, 6 Piercing (when raised)": a note at the end covers
// the whole list; one mid-list, like "2 Blunt (decompression), 4 Cold",
// covers only its own entry.
export function parseResistances(text: string, from: string): Resistance[] {
  const all = text.match(/\(([^)]*)\)\s*$/);
  const parts = text.split(",");
  return parts.flatMap((part) => {
    const m = part.trim().match(/^(-?\d+)\s+([^(]+?)\s*(?:\(([^)]*)\))?$/);
    const type = m && typeNamed(m[2]);
    if (!m || !type) return [];
    const where = all ? all[1] : m[3];
    return [{ type, amount: Number(m[1]), from, ...(where ? { where: where.trim() } : {}) }];
  });
}

// A Trait's effect, like "Rank *3 resistance to all Physical damage types" or
// "Rank *3 added to this character's Blunt, Slashing, and Piercing
// resistances for attacks that hit its torso", at the rank held, or a flat
// amount whatever the rank, like Iron Jaw's "+2 to this character's Blunt
// Resistance for Attacks that hit their head".
export function traitResistances(effect: string, rank: number, from: string): Resistance[] {
  return effect.split(/(?<=\.)\s+/).flatMap((sentence) => {
    const perRank = sentence.match(/Rank \*(\d+)/i);
    const flat = perRank ? null : sentence.match(/\+(\d+) to [^.]*resist/i);
    if ((!perRank && !flat) || !/resist/i.test(sentence)) return [];
    const amount = perRank ? Number(perRank[1]) * rank : Number(flat![1]);
    const types = new Set<DamageType>();
    for (const [group, members] of Object.entries(DAMAGE_TYPE_GROUPS)) {
      if (new RegExp(`all ${group} damage types`, "i").test(sentence)) members.forEach((t) => types.add(t));
    }
    for (const t of DAMAGE_TYPES) if (new RegExp(`\\b${t.replace("/", "\\/")}\\b`).test(sentence)) types.add(t);
    const where = sentence.match(/attacks that hit (?:its|their|the) (\w+)/i)?.[1];
    return [...types].map((type) => ({ type, amount, from, ...(where ? { where } : {}) }));
  });
}

// Every resistance in effect: equipped items, and the Traits and Conditions
// held (a Trait held both ways counts once, at its higher rank).
export function resistancesOf(content: Content, items: Item[], held: { trait: string; rank: number }[]): Resistance[] {
  const fromItems = items.flatMap((item) => {
    if (!item.equipped) return [];
    const stock = (item.item && content.items.find((s) => s.id === item.item)) || stockItemNamed(content.items, item.name);
    return stock?.resistances ? parseResistances(stock.resistances, stock.name) : [];
  });
  const ranks = new Map<string, number>();
  for (const h of held) ranks.set(h.trait, Math.max(ranks.get(h.trait) ?? 0, h.rank));
  const fromTraits = [...ranks].flatMap(([id, rank]) => {
    const trait = content.traits.find((t) => t.id === id);
    return trait ? traitResistances(trait.effect, rank, trait.name) : [];
  });
  return [...fromItems, ...fromTraits];
}
