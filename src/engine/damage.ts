// A weapon's damage, as the Sheet words it. Types separated by commas are all
// dealt at once ("2 Blunt, 2 Electrical"); options separated by a slash are a
// choice the player makes ("5 Slashing / 4 Piercing"). A slash inside a type's
// own name, like Acidic/Corrosive, isn't a choice: a choice starts with a number.

// In the Mechanics page's order: Physical, Elemental, Supernatural, then the
// other common elemental effects.
export const DAMAGE_TYPE_GROUPS = {
  Physical: ["Blunt", "Slashing", "Piercing"],
  Elemental: ["Heat", "Cold", "Electrical", "EMP"],
  Supernatural: ["Metaphysical", "Death", "Psychic"],
  Other: ["Radiation", "Acidic/Corrosive"],
} as const;
export const DAMAGE_TYPES = Object.values(DAMAGE_TYPE_GROUPS).flat();
export type DamageType = (typeof DAMAGE_TYPES)[number];

export interface Damage {
  type: DamageType;
  // Left out where the Sheet gives only the type, like a torch's Heat
  amount?: number;
}

const typeNamed = (name: string) => DAMAGE_TYPES.find((t) => t.toLowerCase() === name.trim().toLowerCase());

// The options to choose from, each a list of the damage it deals at once.
// Undefined if any part isn't "N Type" with a known type.
export function parseDamage(text: string): Damage[][] | undefined {
  const options = text.split(/\s*\/\s*(?=\d)/).map((option) =>
    option.split(",").map((part) => {
      const m = part.trim().match(/^(?:(\d+)\s+)?(.+)$/);
      const type = m && typeNamed(m[2]!);
      return type ? { type, ...(m[1] ? { amount: Number(m[1]) } : {}) } : undefined;
    }),
  );
  return options.every((o) => o.every(Boolean)) ? (options as Damage[][]) : undefined;
}

// "5 Slashing or 4 Piercing", "2 Blunt and 2 Electrical", or the text as
// written if it doesn't parse.
export function damageText(text: string): string {
  const options = parseDamage(text);
  if (!options) return text;
  const and = (o: Damage[]) => {
    const parts = o.map((d) => (d.amount === undefined ? d.type : `${d.amount} ${d.type}`));
    return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]!;
  };
  return options.map(and).join(" or ");
}

// How a weapon Attacks, in a line with each part labeled, like
// "Melee Attack; Max Range: 2 m; Attack Stat: Grace / Power" or
// "Ranged, Thrown Attack; Attack Stat: Grace; Area of Effect: 5 m; Reload: Full Action".
export function attackText(item: {
  attackType?: string;
  maxRange?: string;
  attackStat?: string;
  areaOfEffect?: string;
  reload?: string;
  onHit?: string;
}): string {
  return [
    item.attackType ? `${item.attackType} Attack` : "",
    item.maxRange ? `Max Range: ${item.maxRange}` : "",
    item.attackStat ? `Attack Stat: ${item.attackStat}` : "",
    item.areaOfEffect ? `Area of Effect: ${item.areaOfEffect}` : "",
    item.reload ? `Reload: ${item.reload} Action` : "",
    item.onHit ? `On Hit: ${item.onHit}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}
