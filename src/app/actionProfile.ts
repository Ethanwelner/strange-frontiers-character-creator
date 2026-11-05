// The temporary weapon an Action like Cast Fireball attacks with, read from
// the Action's text: "... a temporary weapon that has the following profile:
// (Ranged) (max range 30 m) (2 Blunt per Rank, 4 Heat per Rank) (Attack Stat:
// Magic) (area of effect: 3 m per Rank). Characters and Items damaged ...".
// The cards show it with the item cards' damage and range badges.
import { DAMAGE_TYPES, type DamageType } from "../engine/damage.js";

export interface ProfileDamage {
  type: DamageType;
  amount: number;
  perRank: boolean;
}

export interface ActionProfile {
  // The Action's text before the profile, ending "a temporary weapon:"
  before: string;
  // Whatever follows it, like what a hit does
  after: string;
  attackType?: string;
  maxRange?: string;
  damage: ProfileDamage[];
  attackStat?: string;
  areaOfEffect?: { amount: number; unit: string; perRank: boolean };
  // Parts the badges can't read, kept as written
  other: string[];
}

const typeNamed = (name: string) => DAMAGE_TYPES.find((t) => t.toLowerCase() === name.trim().toLowerCase());

export function parseActionProfile(action: string): ActionProfile | undefined {
  const m = action.match(/^([\s\S]*?)\s*(?:that has|that possesses|with) the following profile:\s*((?:\([^)]*\)[\s,]*)+)\.?\s*([\s\S]*)$/i);
  if (!m) return undefined;
  const profile: ActionProfile = { before: `${m[1]!.trim()}:`, after: m[3]!.trim(), damage: [], other: [] };
  for (const [, raw] of m[2]!.matchAll(/\(([^)]*)\)/g)) {
    const part = raw!.trim();
    let f: RegExpMatchArray | null;
    if (/^(ranged|melee)(, thrown)?$/i.test(part)) profile.attackType = part[0]!.toUpperCase() + part.slice(1).toLowerCase();
    else if ((f = part.match(/^max range:?\s*(.+)$/i))) profile.maxRange = /\d$/.test(f[1]!) ? `${f[1]} m` : f[1]!;
    else if ((f = part.match(/^attack stat:\s*(.+)$/i))) profile.attackStat = f[1]![0]!.toUpperCase() + f[1]!.slice(1);
    else if ((f = part.match(/^area of effect:?\s*(\d+(?:\.\d+)?)\s*(m|meters?)(\s+per rank)?$/i)))
      profile.areaOfEffect = { amount: Number(f[1]), unit: "m", perRank: !!f[3] };
    else {
      const damage = part.split(/\s*,\s*/).map((d) => {
        const dm = d.match(/^(\d+)\s+(.+?)(\s+per rank)?$/i);
        const type = dm && typeNamed(dm[2]!);
        return dm && type ? { type, amount: Number(dm[1]), perRank: !!dm[3] } : undefined;
      });
      if (damage.every((d) => d)) profile.damage.push(...(damage as ProfileDamage[]));
      else profile.other.push(part);
    }
  }
  return profile;
}
