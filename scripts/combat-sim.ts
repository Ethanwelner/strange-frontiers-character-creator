// Combat simulator: runs a party against monsters and NPCs under the Incidents
// rules (portfolio_site php/rpg/rpg-incidents.php) many times and reports how
// the fights go, so the combat system's numbers can be checked.
//
//   npm run sim                         every scenario, 2,000 fights each
//   npm run sim -- --log murk-10        one scenario, plus a Round-by-Round log of one fight
//   npm run sim -- --n 10000            more fights per scenario
//   npm run sim -- --only murk          only scenarios whose id starts with "murk"
//   npm run sim -- --even               front line spends every third Level on Social or Mental
//   SF_DMG_ADD=2 npm run sim           every weapon deals +2 damage (SF_DMG_MULT=1.5 multiplies instead), for testing
//   SF_PIERCE=0.5 npm run sim          armor and shields with half their Piercing Resistance, for testing
//   SF_RAGE=3 npm run sim            Rage at +3 per Barbarian Rank instead of +2, for testing
//   npm run sim -- --shooters           a party of four guns: Soldier, Marksman, Trooper and a Machine Gunner
//   npm run sim -- --suppress           the Soldier also carries a Machine Gun for Suppressing Fire
//   npm run sim -- --gear               the party with higher-class weapons and the resource-spending Traits
//   npm run sim -- --stats knight       one build's Stats, Traits and resources at every Level
//
// Weapons, armor, Wield Skills, Abilities and spells come from content/.
// Characters are built the way the creator builds them: Kind bonuses, an
// Origin point, then one core point per Level, each giving 3 focus points (or
// one Magic point and 3 MP). Ranked Traits follow the Trait Ranks rule: Rank 2
// and up need every required Stat at its requirement × the Rank. Murk Legs is the stat block
// in the Parazoology section (php/rpg/lore/murk-legs.php), the baseline
// creature template; the other enemies are NPCs built like characters.
//
// What the rules leave open, and what this script assumes, is listed under
// ASSUMPTIONS below and printed with the results.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { parseDamage, type Damage } from "../src/engine/damage.js";

const ASSUMPTIONS = [
  "Flat Attacks: every conscious character has Defense 10, so an unmodified roll hits 55% of the time. Sleep targets 8 + Demeanor; Mind Spike and Mind Shatter 5 + highest Mental focus Stat. A Wield Skill adds +1 per Rank to hit. Spells and monster attacks add nothing either. Severity bands are 3 wide: Glancing 0-2, Solid 3-5, Devastating 6-8, Critical 9+; only a Critical Failure (miss by 10+) leaves the attacker Flat-Footed. SF_OLD_ATTACKS=1 restores the old rules. Old note: Attack Rolls add no Stat; Wield Skills give +3 per Rank. Spells add Magic, as their profiles say. Monster weapons use their stat block's formula.",
  "Damage after Resistance can't go below 0; a Severity's damage change applies to each damage type in the Attack.",
  "Incapacitated (below a quarter of max HP) takes a character out of the fight until healed; nobody finishes them off.",
  "Coverage-limited Resistances, like a helmet's '(head)', are ignored: there are no hit locations yet.",
  "No natural 20 or natural 1 rule; Severity comes only from the margin.",
  "Defend's bonuses last the whole Round, whatever the Defender's Priority step.",
  "Fighting with no Wield Skill gets no penalty: the rules mention one but don't give a number.",
  "Ammunition, reloading and spell ranges beyond 'in range' aren't tracked; 'Partial' reload weapons fire every Round.",
  "Movement is on a line. Within a Priority step Attacks resolve before Movement, so a fighter out of reach moves one Round and Attacks the next.",
  "Massive Claws (Area 3 m) is an Area of Effect: no roll, a Glancing Blow on everyone within 3 m, friend or foe.",
  "Dark Haze: d20 + Intuition >= 10 per Rank, rolled on a character's first Attack at the creature each Round until they pass; until then they Attack the haze at -6 (Heavy Cover).",
  "Fearsome: d20 + Demeanor >= 13 on a character's first Attack (spells included) at the creature, once per Incident, rolled before Dark Haze. Frightened loses a Rank at the end of each Round; a Frightened character won't move toward a Fearsome one.",
  "Rage's -10 to Social and Mental rolls applies to the Fearsome and Dark Haze checks; Rage makes a character immune to Frightened. A Barbarian Rages when doubled damage beats the lost checks.",
  "Monsters are built from Physical plus Monster Traits (makeMonster): Honed Instincts, Natural Armor, Massive, Many Limbs, Apex (a second Action at Priority -5), Ambusher, Cornered, Regeneration, Seize, Pounce and Drag Under, as on the site's sheets. SF_MONSTER_NO_SLEEP=1 makes monsters immune to Sleep; SF_BOAR_MASSIVE and SF_LURKER_MASSIVE try other Massive Ranks.",
  "Advantage is the GM's call in the rules and isn't modeled. Expert Swordsman gives +1 with swords; Aim gives +4 on the next Ranged Attack at that target.",
  "Ranked Traits: Rank r needs every required Stat at its requirement × r, and Ranks cap at 3.",
  "Sleep is an Attack (Magic) against 5 + Demeanor, so Fearsome and Dark Haze apply to it; a hit lands with the step's other hits.",
  "Heal spends up to 1 MP per Rank, 4 HP per MP.",
  "Mark Quarry's Knowledge check always succeeds: the party prepared for the hunt.",
  "A Healing Potion heals like Heal at its Rank, without the caster's Magic: 4 HP per Rank. Drinking one is a Full RP Action. Each party member carries two Rank 1 potions.",
  "Asleep: Defense 0 and no Actions until damaged. Every Attack in the same Priority step lands before the damage wakes them.",
  "Breach X ignores X of the target's Resistance to each damage type; to-hit spending adds to the roll. Spending Traits pay before the roll: enough to-hit bonus to reach about a 60% hit, enough Breach to clear the Resistance, then damage. Casters keep 3 MP for Heal; nobody spends HP below half.",
  "Full reload weapons (Rail Rifle, Hydrogen Lance) fire, then need a Full RP Action to reload; the AI uses another weapon unless it's less than half as good.",
  "Rage adds a flat +2 weapon damage per Barbarian Rank on a hit that gets through (SF_RAGE sets the amount for testing).",
  "Debuffs lower Defense: Flat-Footed -3, Frightened -1 per Rank. Flanking gives no bonus to hit; it only beats cover. The only stock to-hit bonuses are Aim (+4) and firing from an elevated position (+3, not modeled).",
  "Cover (Light -3, Heavy -6) applies to Ranged Attacks against a side's characters on Rounds they don't move. The Pulse Carbine ignores Light Cover.",
  "Aim: a Full RP Action when a shot's hit chance is under 35%; the next Ranged Attack at that target gets +4.",
  "Suppressing Fire: a Full Action with a Suppression weapon when it would catch two or more foes in a 5 m area (centered on one or between two) that someone on its side can shoot. Each makes a Demeanor check against 10 + 3 per Wield Rank or is Pinned: a Full Defend Action on its next Round (+3 Defense, no Attack, no Movement). In firefights each side stands 3 m apart.",
  "Positions are on a plane. Each character's cover faces the enemy's starting side; an attacker more than 45° off that facing ignores it (flanking beats cover). A shooter whose target has cover moves to a spot 55° off it when no more than one foe who could shoot back isn't Pinned (SF_NO_FLANK turns this off). Melee flanking needs an ally at least 90° around the target.",
  "Not modeled: Prone, Slowed, Restrained, Blinded, elevated positions and hiding. Not modeled: Bodyguard's Cover, Weak Point, Second Wind, Daze, Shield, Charm, Grenadier and other Traits that need positions or choices the line model can't make.",
];

// ---------- content ----------

// Flat d20 Attacks: Defense 10 for everyone, no Stat or Wield bonus to hit (SF_OLD_ATTACKS=1 for the old rules)
const FLAT = !process.env.SF_OLD_ATTACKS;

const CONTENT = join(import.meta.dirname, "..", "content");
const readYaml = (path: string) => parse(readFileSync(path, "utf8"));
const items: Record<string, any> = Object.fromEntries(
  readdirSync(join(CONTENT, "items")).map((f) => {
    const y = readYaml(join(CONTENT, "items", f));
    return [y.id, y];
  }),
);
const traits: Record<string, any> = {};
for (const dir of readdirSync(join(CONTENT, "traits"))) {
  for (const f of readdirSync(join(CONTENT, "traits", dir))) {
    const y = readYaml(join(CONTENT, "traits", dir, f));
    traits[y.id] = y;
  }
}
const wieldFor = (itemName: string) =>
  Object.values(traits).find((t) => t.list === "wield" && String(t.name).toLowerCase() === `wield: ${itemName}`.toLowerCase());
// A weapon's Wield Skill: its own name, or the one its notes name ("Wielded with Wield: Rifle.")
const wieldForItem = (it: any) => {
  const named = String(it.notes ?? "").match(/Wielded with Wield: ([A-Za-z ]+)\./);
  return wieldFor(named ? named[1]! : it.name);
};

type Stat =
  | "endurance" | "power" | "grace"
  | "empathy" | "persuasion" | "demeanor"
  | "logic" | "intuition" | "memory";
type Core = "physical" | "social" | "mental";
type Want = [Stat | "magic", number];
const FOCUS: Record<Core, Stat[]> = {
  physical: ["endurance", "power", "grace"],
  social: ["empathy", "persuasion", "demeanor"],
  mental: ["logic", "intuition", "memory"],
};
const ALL_STATS = Object.values(FOCUS).flat();
const coreOf = (s: Stat): Core => (Object.keys(FOCUS) as Core[]).find((c) => FOCUS[c].includes(s))!;

function parseResistances(text?: string): { always: Record<string, number>; defending: Record<string, number> } {
  const out = { always: {} as Record<string, number>, defending: {} as Record<string, number> };
  if (!text) return out;
  const defending = /when defending/i.test(text);
  if (/\((head|arms|legs)\)/i.test(text)) return out; // coverage areas: see ASSUMPTIONS
  for (const m of text.matchAll(/(-?\d+)\s+([A-Za-z]+)/g)) {
    const bucket = defending ? out.defending : out.always;
    bucket[m[2]!] = (bucket[m[2]!] ?? 0) + Number(m[1]);
  }
  return out;
}

// ---------- combatants ----------

interface Spell {
  id: string;
  mp: number;
  vsMental?: boolean; // Mind Spike and Mind Shatter: 5 + highest Mental focus Stat
  vsDemeanor?: boolean; // Sleep: 8 + Demeanor
  onDamage?: (t: Combatant, rank: number) => void;
  onHit?: (t: Combatant, rank: number) => void; // a hit with no damage, like Sleep
}

// Rage makes a character immune to Frightened
function frighten(t: Combatant, rank: number) {
  if (!t.rage && !t.undead) t.frightened = Math.max(t.frightened, rank);
}

interface Weapon {
  name: string;
  options: Damage[][];
  bonus: number; // Wield Skill (+3 per Rank), a spell's Magic, a monster's formula
  wieldRank?: number;
  sword?: boolean;
  blade?: boolean;
  firearm?: boolean;
  natural?: boolean;
  reloadFull?: boolean;
  ignoreLightCover?: boolean;
  automatic?: boolean; // can lay down Suppressing Fire // fires, then takes a Full RP Action to reload
  breach?: number; // ignores this much of the target's Resistance to each damage type
  ranged: boolean;
  range: number; // meters
  area?: number; // Area of Effect radius
  spell?: Spell & { rank: number };
  twice?: boolean; // Many Limbs: each Attack Action with it makes two Attacks
  seize?: boolean; // Seize: a Solid Hit or better leaves the target Rooted in its grip
  pounce?: boolean; // Pounce: Full Movement and this Attack in one Action; a Solid Hit or better knocks the target Prone
}

interface Combatant {
  name: string;
  side: "party" | "enemy";
  build?: string;
  level?: number;
  core: Record<Core | "magic", number>;
  stats: Record<Stat, number>;
  hpMax: number;
  hp: number;
  defense: number;
  resist: Record<string, number>;
  defendResist: Record<string, number>;
  defendBonus: number; // a shield's Defense while Defending
  basePriority: number; // encumbrance and Combat Instincts
  weapons: Weapon[];
  ranks: Record<string, number>; // Traits held, by id
  mpMax: number;
  mp: number;
  vp: number;
  sp: number;
  potions: number;
  mustReload: Set<Weapon>;
  ai: "fighter" | "knight" | "bruiser" | "caster" | "monster";
  monster?: boolean;
  darkHaze?: number; // Rank
  hazeSeen?: Map<Combatant, true | number>; // true once they've passed, else the Round they last failed
  fearChecked?: Set<Combatant>; // who has made their Fearsome check this Incident
  fearsome?: boolean;
  notes: string[];
  // state
  pos: number; // x, meters
  y: number;
  facing: Pt; // where its cover faces
  flatFooted: boolean;
  flatNext: boolean;
  frightened: number; // Rank
  asleep: boolean;
  surprised: boolean;
  rage: boolean;
  undead?: boolean;
  attackedThisRound: boolean;
  marked?: Combatant;
  defending: boolean;
  shieldwall: boolean;
  riposte: boolean;
  injuries: { organ: number; broken: number };
  moved?: boolean; // moved this Round, so out of cover
  pinned?: boolean; // must take a Full Defend Action this Round
  pinnedNext?: boolean;
  aimAt?: Combatant; // Aimed last Round: Advantage on the first Ranged Attack at it
  // Monster Traits (php/rpg/encounters.php and the Murk Legs sheet)
  apex?: boolean; // a second full Action each Round, at Priority -5
  regen?: number; // Regeneration Rank: 2 HP per Rank at the start of each Round, unless it took Heat damage last Round
  heatRound?: number; // the last Round it took Heat damage
  cornered?: boolean; // +2 damage while below half HP
  ambusher?: boolean; // +3 Priority on the first Round
  dragUnder?: boolean; // can drag a character it has Seized under the water
  seizedBy?: Combatant; // Rooted in a monster's grip
  under?: boolean; // dragged under: Blinded (-6 Defense, -6 to Attack Rolls), loses 1d6 HP a Round
  prone?: boolean; // -3 Defense against Melee Attacks
  proneUntil?: number; // the Round it stands back up after
}

const statValue = (c: { stats: Record<Stat, number>; core: Record<string, number> }, s: string) =>
  s === "magic" ? c.core.magic ?? 0 : c.stats[s as Stat] ?? 0;

// The Rank a character can hold in a Trait: 0 if they don't meet it.
function rankFor(id: string, c: { stats: Record<Stat, number>; core: Record<string, number> }, held: Record<string, number>): number {
  const t = traits[id];
  if (!t) throw new Error(`No Trait ${id}`);
  if ((t.prerequisites ?? []).some((p: string) => !held[p])) return 0;
  const needs = Object.entries(t.minStats ?? {}) as [string, number][];
  if (!needs.every(([s, n]) => statValue(c, s) >= n)) return 0;
  if (!t.ranked) return 1;
  // Rank r needs every required Stat at its requirement × r
  let r = 1;
  while (r < 3 && needs.every(([s, n]) => statValue(c, s) >= n * (r + 1))) r++; // Ranks cap at 3
  return r;
}

function weaponFrom(id: string, c: Combatant): Weapon {
  const it = items[id];
  if (!it) throw new Error(`No item ${id}`);
  const wield = wieldForItem(it);
  const rank = wield ? rankFor(wield.id, c, c.ranks) : 0;
  if (wield && rank) c.ranks[wield.id] = rank;
  const tags: string[] = it.tags ?? [];
  const breach = String(it.modifiers ?? "").match(/^\(Breach: (\d+)\)$/);
  // SF_DMG_MULT and SF_DMG_ADD raise every weapon's damage for testing: each type is
  // multiplied (rounded), and the first type in each option gets the flat bonus
  const mult = Number(process.env.SF_DMG_MULT ?? 1), add = Number(process.env.SF_DMG_ADD ?? 0);
  const options = parseDamage(it.damage)!.map((o) => o.map((d, i) => ({ ...d, amount: Math.round((d.amount ?? 0) * mult) + (i === 0 ? add : 0) })));
  return {
    name: it.name,
    options,
    // Flat d20: Wield gives no bonus; fighting without one is -3 (natural weapons exempt)
    bonus: FLAT ? rank : 3 * rank,
    wieldRank: rank,
    sword: tags.includes("sword"),
    blade: tags.includes("blade") || tags.includes("axe") || tags.includes("sword"),
    firearm: tags.includes("firearm"),
    natural: tags.includes("natural weapon"),
    automatic: /Suppression/.test(it.modifiers ?? ""),
    reloadFull: it.reload === "Full",
    ignoreLightCover: /Light Cover counts as no Cover/.test(it.modifiers ?? ""),
    breach: breach ? Number(breach[1]) : 0,
    ranged: String(it.attackType).startsWith("Ranged"),
    range: parseFloat(it.maxRange ?? "1"),
    area: it.areaOfEffect ? parseFloat(it.areaOfEffect) : undefined,
  };
}

// Attack spells as temporary weapons, from their Cast profiles
const ATTACK_SPELLS: Record<string, (r: number) => Omit<Weapon, "bonus" | "spell"> & { spell: Spell }> = {
  "ice-lance": (r) => ({
    name: "Ice Lance", options: [[{ type: "Piercing", amount: 3 * r }, { type: "Cold", amount: 2 * r }]], ranged: true, range: 40,
    spell: { id: "ice-lance", mp: 2 },
  }),
  "mind-spike": (r) => ({
    name: "Mind Spike", options: [[{ type: "Psychic", amount: 4 * r }]], ranged: true, range: 30,
    spell: { id: "mind-spike", mp: 2, vsMental: true, onDamage: (t) => { t.flatNext = true; } },
  }),
  "mind-shatter": (r) => ({
    name: "Mind Shatter", options: [[{ type: "Psychic", amount: 6 * r }]], ranged: true, range: 30,
    spell: { id: "mind-shatter", mp: 4, vsMental: true, onDamage: (t, rank) => { t.flatNext = true; frighten(t, rank); } },
  }),
};
const sleepSpell = (magic: number, rank: number): Weapon => ({
  name: "Sleep", options: [[]], bonus: FLAT ? 0 : magic, ranged: true, range: 20,
  spell: { id: "sleep", mp: 2, rank, vsDemeanor: true, onHit: (t) => { if (!t.undead && !(t.monster && process.env.SF_MONSTER_NO_SLEEP)) t.asleep = true; } },
});

interface Build {
  name: string;
  kind: { bonus: Partial<Record<Stat, number>>; max: Partial<Record<Stat, number>>; mp?: number };
  origin: Stat;
  cores?: string; // fixed: one letter per Level (P, S, M or A for Magic); otherwise follow `wants`
  wants: Want[]; // Stats to reach, in order; core points go to the first one not yet met
  traits: string[]; // Abilities and spells to take when they qualify
  weapons: string[];
  armor: string[];
  potions?: number;
  ammo?: "penetrator-rounds" | "fast-hydrogen-rounds"; // loaded in its firearms
  ai: Combatant["ai"];
  frontLine?: boolean; // --even applies
  // A stat sheet's exact Stats (the site's encounter sheets), instead of building up by Level
  fixed?: { core: Record<Core | "magic", number>; stats: Partial<Record<Stat, number>> };
  resist?: string; // natural Resistances, like a Skeleton's
  undead?: boolean; // immune to Asleep, Frightened and Psychic damage
}

const HUMAN = {
  bonus: Object.fromEntries(ALL_STATS.map((s) => [s, 1])),
  max: Object.fromEntries(ALL_STATS.map((s) => [s, 15])),
};
const ORCOID = {
  bonus: { endurance: 2, power: 2, grace: 1, empathy: 1, persuasion: 1, demeanor: 1, logic: 0, intuition: 1, memory: 0 },
  max: { endurance: 18, power: 18, grace: 13, empathy: 14, persuasion: 15, demeanor: 15, logic: 13, intuition: 15, memory: 14 },
};
const GOBLINOID = {
  bonus: { endurance: 1, power: 0, grace: 1, empathy: 1, persuasion: 1, demeanor: 1, logic: 2, intuition: 1, memory: 1 },
  max: { endurance: 13, power: 10, grace: 16, empathy: 15, persuasion: 15, demeanor: 14, logic: 18, intuition: 16, memory: 18 },
  mp: 6,
};

const EVEN = process.argv.includes("--even");

function build(b: Build, level: number, side: Combatant["side"], label?: string): Combatant {
  const stats = Object.fromEntries(ALL_STATS.map((s) => [s, b.fixed ? (b.fixed.stats[s] ?? 0) : (b.kind.bonus[s] ?? 0)])) as Record<Stat, number>;
  const max = (s: Stat) => b.kind.max[s] ?? 20;
  if (!b.fixed) stats[b.origin] += 1;
  const core: Record<Core | "magic", number> = b.fixed ? { ...b.fixed.core } : { physical: 0, social: 0, mental: 0, magic: 0 };
  const unmet = ([s, n]: Want) => (s === "magic" ? core.magic < n : stats[s] < n && stats[s] < max(s));
  for (let l = 0; l < (b.fixed ? 0 : level); l++) {
    let c: Core | "magic";
    if (b.cores) {
      const letter = b.cores[Math.min(l, b.cores.length - 1)]!;
      c = letter === "A" ? "magic" : letter === "S" ? "social" : letter === "M" ? "mental" : "physical";
    } else {
      const w = b.wants.find(unmet);
      c = !w ? "physical" : w[0] === "magic" ? "magic" : coreOf(w[0]);
    }
    // --even: the front line spends every third Level on its weaker of Social and Mental
    if (EVEN && b.frontLine && l % 3 === 2) c = core.social <= core.mental ? "social" : "mental";
    core[c]++;
    if (c === "magic") continue;
    for (let p = 0; p < 3; p++) {
      const want = b.wants.find((w) => w[0] !== "magic" && FOCUS[c as Core].includes(w[0]) && unmet(w));
      const pick = (want?.[0] as Stat | undefined) ?? FOCUS[c].filter((s) => stats[s] < max(s)).sort((x, y) => stats[x] - stats[y])[0];
      if (pick) stats[pick]++;
    }
  }
  const self = { stats, core };
  const ranks: Record<string, number> = {};
  // Twice, so prerequisites taken later in the list still count
  for (let pass = 0; pass < 2; pass++) for (const id of b.traits) { const r = rankFor(id, self, ranks); if (r) ranks[id] = r; }

  const resist: Record<string, number> = {};
  const defendResist: Record<string, number> = {};
  let defendBonus = 0;
  let weight = 0;
  for (const id of [...b.armor, ...b.weapons]) {
    const it = items[id];
    if (!it) throw new Error(`No item ${id}`);
    const isShield = (it.tags ?? []).includes("shield");
    const isArmor = it.category === "armor" && !isShield;
    let w = it.weight ?? 0;
    if (isShield && ranks["shield-bearer"]) w = 0;
    if (isArmor && ranks["armor-training"]) w = ranks["armor-training"] >= 2 ? 0 : w / 2;
    weight += w;
    const r = parseResistances(it.resistances);
    // SF_PIERCE scales gear's Piercing Resistance for testing (0.5 halves it, rounded down)
    const scale = (t: string, n: number) => (t === "Piercing" ? Math.floor(n * PIERCE_SCALE) : n);
    for (const [t, n] of Object.entries(r.always)) resist[t] = (resist[t] ?? 0) + scale(t, n);
    for (const [t, n] of Object.entries(r.defending)) defendResist[t] = (defendResist[t] ?? 0) + scale(t, n);
    const m = String(it.modifiers ?? "").match(/Defense \+(\d+) \(when Defending\)/);
    if (m) defendBonus += Number(m[1]);
  }
  for (const [t, n] of Object.entries(parseResistances(b.resist).always)) resist[t] = (resist[t] ?? 0) + n;
  if (b.undead) resist.Psychic = 99;
  if (ranks["thick-hide"]) { resist.Slashing = (resist.Slashing ?? 0) + 1; resist.Piercing = (resist.Piercing ?? 0) + 1; }
  const carry = 20 + 10 * core.physical;
  const encumbered = weight > carry / 2;
  const notes: string[] = [];
  if (encumbered) notes.push(`carries ${weight} of ${carry} kg: -1 Priority`);
  const hpMax = 10 + stats.endurance + stats.power + stats.grace;
  const mpMax = (b.kind.mp ?? 0) + 3 * core.magic;
  const c: Combatant = {
    name: label ?? b.name,
    side,
    build: b.name,
    level,
    core,
    stats,
    hpMax,
    hp: hpMax,
    defense: FLAT ? 10 : 10 + core.physical,
    resist,
    defendResist,
    defendBonus,
    basePriority: (encumbered ? -1 : 0) + (ranks["combat-instincts"] ?? 0),
    weapons: [],
    ranks,
    mpMax,
    mp: mpMax,
    vp: stats.empathy + stats.persuasion + stats.demeanor,
    sp: stats.logic + stats.intuition + stats.memory,
    potions: b.potions ?? 0,
    mustReload: new Set(),
    ai: b.ai,
    notes,
    pos: 0,
    y: 0,
    facing: { x: 1, y: 0 },
    flatFooted: false,
    flatNext: false,
    frightened: 0,
    asleep: false,
    surprised: false,
    rage: false,
    attackedThisRound: false,
    defending: false,
    shieldwall: false,
    riposte: false,
    injuries: { organ: 0, broken: 0 },
  };
  c.undead = b.undead;
  c.weapons = [...b.weapons.filter((id) => items[id]?.damage), "fists"].map((id) => weaponFrom(id, c));
  // Ammunition in its firearms (Pistol, Rifle, Submachine Gun and Machine Gun class)
  for (const w of c.weapons.filter((w) => w.firearm && !w.reloadFull)) {
    if (b.ammo === "penetrator-rounds") w.breach = (w.breach ?? 0) + 3;
    if (b.ammo === "fast-hydrogen-rounds") w.options = w.options.map((o) => [...o, { type: "Heat", amount: 3 }]);
  }
  const lodestaff = b.weapons.includes("lodestaff");
  for (const [id, make] of Object.entries(ATTACK_SPELLS)) {
    const r = ranks[id];
    if (!r) continue;
    const w = make(r);
    // A Lodestaff adds +1 damage per Rank to attack spells
    if (lodestaff) w.options = w.options.map((o) => o.map((d, i) => (i === 0 ? { ...d, amount: (d.amount ?? 0) + r } : d)));
    c.weapons.unshift({ ...w, bonus: FLAT ? 0 : core.magic, spell: { ...w.spell, rank: r } });
  }
  if (b.ammo) notes.push(items[b.ammo].name);
  return c;
}

// Monsters: built from Physical, then made dangerous by bespoke Monster Traits
// (the sheets in php/rpg/encounters.php and php/rpg/lore/murk-legs.php)
interface MonsterSpec {
  name: string;
  core: Record<Core | "magic", number>;
  stats: Partial<Record<Stat, number>>;
  resist: Record<string, number>; // Natural Armor and the like
  massive?: number; // +10 HP per Rank
  weapons: Weapon[];
  apex?: boolean;
  regen?: number;
  cornered?: boolean;
  ambusher?: boolean;
  dragUnder?: boolean;
  darkHaze?: number;
  fearsome?: boolean;
}
function makeMonster(m: MonsterSpec): Combatant {
  const stats = Object.fromEntries(ALL_STATS.map((s) => [s, m.stats[s] ?? 0])) as Record<Stat, number>;
  const hpMax = 10 + stats.endurance + stats.power + stats.grace + 10 * (m.massive ?? 0);
  return {
    name: m.name, side: "enemy", core: m.core, stats, hpMax, hp: hpMax, defense: 10,
    resist: { ...m.resist }, defendResist: {}, defendBonus: 0, basePriority: 0,
    weapons: m.weapons, ranks: {}, mpMax: 0, mp: 0, vp: 0, sp: 0, potions: 0, mustReload: new Set(),
    ai: "monster", monster: true,
    darkHaze: m.darkHaze, hazeSeen: new Map(), fearChecked: new Set(), fearsome: m.fearsome,
    apex: m.apex, regen: m.regen, cornered: m.cornered, ambusher: m.ambusher, dragUnder: m.dragUnder,
    notes: [], pos: 0, y: 0, facing: { x: -1, y: 0 },
    flatFooted: false, flatNext: false, frightened: 0, asleep: false, surprised: false, rage: false,
    attackedThisRound: false, defending: false, shieldwall: false, riposte: false, injuries: { organ: 0, broken: 0 },
  };
}
const natural = (name: string, type: Damage["type"], amount: number, range: number, honed: number, extra: Partial<Weapon> = {}): Weapon =>
  ({ name, options: [[{ type, amount }]], bonus: honed, ranged: false, range, natural: true, ...extra });

// Briar Boar: Pounce, Natural Armor 1, Honed Instincts 1, Cornered
const briarBoar = () => makeMonster({
  name: "Briar Boar", core: { physical: 4, social: 0, mental: 0, magic: 0 },
  stats: { endurance: 5, power: 5, grace: 2 }, resist: { Blunt: 1, Slashing: 1, Piercing: 1 }, massive: Number(process.env.SF_BOAR_MASSIVE ?? 1),
  weapons: [natural("Gore", "Piercing", 7, 1, 1, { pounce: true })], cornered: true,
});
// Mire Lurker: Ambusher, Seize, Drag Under, Massive 1, Natural Armor 2, Regeneration 1, Honed Instincts 2
const mireLurker = () => makeMonster({
  name: "Mire Lurker", core: { physical: 8, social: 0, mental: 0, magic: 0 },
  stats: { endurance: 9, power: 9, grace: 6 }, resist: { Blunt: 3, Slashing: 3, Piercing: 3 }, massive: Number(process.env.SF_LURKER_MASSIVE ?? 3),
  weapons: [natural("Jaws", "Piercing", 9, 2, 2, { breach: 1, seize: true })], regen: 1, ambusher: true, dragUnder: true,
});
// Murk Legs: Apex, Many Limbs (Massive Claws), Massive 2, Natural Armor 2, Honed Instincts 3, Dark Haze, Fearsome
function murkLegs(darkHaze: boolean, fearsome = true): Combatant {
  return makeMonster({
    name: "Murk Legs", core: { physical: 12, social: 1, mental: 2, magic: 0 },
    stats: { endurance: 10, power: 15, grace: 11, empathy: 2, persuasion: 1, demeanor: 0, logic: 1, intuition: 4, memory: 1 },
    resist: { Blunt: 4, Slashing: 3, Piercing: 2 }, massive: 2,
    weapons: [
      natural("Massive Claws", "Slashing", 10, 3, 3, { area: 3, twice: true }),
      natural("Horrid Bite", "Piercing", 15, 3, 3, { breach: 2 }),
    ],
    apex: true, darkHaze: darkHaze ? 2 : undefined, fearsome,
  });
}

// ---------- builds ----------

// A Wield Skill's Rank steps: every required Stat at its requirement × Rank
function wieldWants(itemId: string, upTo: number): Want[] {
  const t = wieldForItem(items[itemId]);
  const needs = Object.entries(t.minStats) as [Stat, number][];
  const out: Want[] = [];
  for (let r = 1; r <= upTo; r++) for (const [s, n] of needs) out.push([s, n * r]);
  return out;
}
const traitWants = (...ids: string[]): Want[] => ids.flatMap((id) => Object.entries(traits[id].minStats ?? {}) as Want[]);
const wieldSteps = (itemId: string, from: number, to: number) => wieldWants(itemId, to).slice(from === 1 ? 0 : wieldWants(itemId, from - 1).length);

const SOLDIER: Build = {
  // A monster hunter with a rifle
  name: "Soldier", kind: HUMAN, origin: "intuition", ai: "fighter", frontLine: false, potions: 2,
  wants: [...wieldSteps("rifle", 1, 1), ...traitWants("combat-instincts", "tracker", "hunter", "monster-hunter"), ...wieldSteps("rifle", 2, 3), ["endurance", 6], ...wieldSteps("rifle", 4, 5), ["endurance", 15]],
  traits: ["combat-instincts", "tracker", "hunter", "monster-hunter", "armor-training"],
  weapons: ["rifle"], armor: ["ballistic-vest", "combat-helmet"],
};
const KNIGHT: Build = {
  name: "Knight", kind: HUMAN, origin: "power", ai: "knight", frontLine: true, potions: 2,
  wants: [...wieldSteps("longsword", 1, 1), ...traitWants("shield-bearer", "armor-training", "swordsman", "shield-wall"), ...wieldSteps("longsword", 2, 2), ...traitWants("expert-swordsman"), ...wieldSteps("longsword", 3, 5), ["endurance", 15]],
  traits: ["shield-bearer", "armor-training", "swordsman", "shield-wall", "expert-swordsman"],
  weapons: ["longsword"], armor: ["chainmail", "wooden-shield"],
};
const BRUISER: Build = {
  name: "Bruiser", kind: HUMAN, origin: "power", ai: "bruiser", frontLine: true, potions: 2,
  wants: [...wieldSteps("greatsword", 1, 1), ...traitWants("barbarian", "armor-training"), ...wieldSteps("greatsword", 2, 2), ["endurance", 6], ...wieldSteps("greatsword", 3, 5), ["endurance", 15]],
  traits: ["barbarian", "armor-training"],
  weapons: ["greatsword"], armor: ["plate-armor"],
};
const MAGE: Build = {
  // A Goblinoid Tatot healer and mentalist: two Levels of Magic for every one elsewhere
  name: "Mage", kind: GOBLINOID, origin: "intuition", ai: "caster", potions: 2,
  cores: "AAPAAMAAPAAMAAPAAMAA",
  wants: [["grace", 4], ["endurance", 4], ["intuition", 6]],
  traits: ["heal", "ice-lance", "mind-spike", "mind-shatter", "sleep"],
  weapons: ["dagger"], armor: ["leather-armor"],
};

// Enemies built evenly: one Level in three goes to Social or Mental
const BANDIT: Build = {
  name: "Bandit", kind: HUMAN, origin: "grace", ai: "fighter", cores: "PPMPPSPPMPPSPPMPPSPP",
  wants: [...wieldWants("spear", 5)],
  traits: ["combat-instincts"],
  weapons: ["spear"], armor: ["leather-armor"],
};
const RAIDER: Build = {
  name: "Orcoid Raider", kind: ORCOID, origin: "power", ai: "bruiser", cores: "PPSPPMPPSPPMPPSPPMPP",
  wants: [...wieldSteps("greatsword", 1, 1), ...traitWants("barbarian", "thick-hide"), ...wieldSteps("greatsword", 2, 5)],
  traits: ["barbarian", "thick-hide", "armor-training"],
  weapons: ["greatsword"], armor: ["hide-armor"],
};
const RIFLEMAN: Build = {
  name: "Rifleman", kind: HUMAN, origin: "grace", ai: "fighter", cores: "PPMPPSPPMPPSPPMPPSPP",
  wants: [...wieldWants("rifle", 3)],
  traits: ["combat-instincts"],
  weapons: ["rifle"], armor: ["ballistic-vest", "combat-helmet"],
};
const MACHINE_GUNNER: Build = {
  name: "Machine Gunner", kind: HUMAN, origin: "power", ai: "fighter", cores: "PPMPPSPPMPPSPPMPPSPP",
  wants: [...wieldWants("machine-gun", 3)],
  traits: ["combat-instincts", "armor-training"],
  weapons: ["machine-gun"], armor: ["ballistic-vest", "combat-helmet"],
};
const SHAMAN: Build = {
  name: "Goblinoid Shaman", kind: GOBLINOID, origin: "intuition", ai: "caster",
  cores: "AAPAAMAASAAMAAPAAMAA",
  wants: [["grace", 4], ["endurance", 4], ["intuition", 6]],
  traits: ["heal", "ice-lance", "mind-spike", "sleep"],
  weapons: ["dagger"], armor: ["hide-armor"],
};

// The site's encounter sheets (php/rpg/encounters.php), Stats exactly as written
const SHEET_BANDIT: Build = {
  name: "Bandit", kind: HUMAN, origin: "grace", ai: "fighter", wants: [], traits: [],
  fixed: { core: { physical: 1, social: 0, mental: 0, magic: 0 }, stats: { endurance: 1, power: 3, grace: 3, empathy: 1, persuasion: 1, demeanor: 1, logic: 1, intuition: 1, memory: 1 } },
  weapons: ["spear", "dagger"], armor: ["gambeson"],
};
const SHEET_SKELETON: Build = {
  name: "Skeleton", kind: HUMAN, origin: "grace", ai: "fighter", wants: [], traits: [],
  fixed: { core: { physical: 4, social: 0, mental: 0, magic: 0 }, stats: { endurance: 3, power: 4, grace: 5 } },
  resist: "3 Piercing, 2 Slashing, -2 Blunt", undead: true,
  weapons: ["shortsword"], armor: [],
};
const SHEET_MERCENARY: Build = {
  name: "Dreftian Mercenary", kind: HUMAN, origin: "power", ai: "knight", wants: [], traits: ["shield-wall"],
  fixed: { core: { physical: 5, social: 1, mental: 2, magic: 0 }, stats: { endurance: 5, power: 7, grace: 7, empathy: 1, persuasion: 3, demeanor: 2, logic: 2, intuition: 3, memory: 4 } },
  weapons: ["longsword", "dagger"], armor: ["brigandine", "wooden-shield"],
};

// --gear: the same party with higher-class weapons and the resource-spending Traits
const G_SOLDIER: Build = {
  ...SOLDIER, name: "Soldier", ammo: "penetrator-rounds",
  wants: [...wieldSteps("rifle", 1, 1), ...traitWants("combat-instincts", "called-shot", "tracker", "hunter", "monster-hunter"), ...wieldSteps("rifle", 2, 2), ...traitWants("vital-shot", "through-the-plates"), ...wieldSteps("rifle", 3, 3), ["endurance", 6], ...wieldSteps("rifle", 4, 5), ["endurance", 15]],
  traits: [...SOLDIER.traits, "called-shot", "vital-shot", "through-the-plates", "wielder-pistol"],
  weapons: ["rail-rifle", "hand-cannon"],
};
const G_KNIGHT: Build = {
  ...KNIGHT, name: "Knight",
  wants: [...wieldSteps("longsword", 1, 1), ...traitWants("shield-bearer", "armor-training", "swordsman", "shield-wall", "feint", "find-the-gap"), ...wieldSteps("longsword", 2, 2), ...traitWants("expert-swordsman"), ...wieldSteps("longsword", 3, 5), ["endurance", 15]],
  traits: [...KNIGHT.traits, "feint", "find-the-gap"],
  weapons: ["masterwork-longsword"],
};
const G_BRUISER: Build = {
  ...BRUISER, name: "Bruiser",
  wants: [...wieldSteps("vibro-axe", 1, 1), ...traitWants("barbarian", "armor-training", "wild-swing"), ...wieldSteps("vibro-axe", 2, 2), ["endurance", 6], ...wieldSteps("vibro-axe", 3, 5), ["endurance", 15]],
  traits: [...BRUISER.traits, "wild-swing"],
  weapons: ["vibro-axe"],
};
const G_MAGE: Build = {
  ...MAGE, name: "Mage",
  wants: [["grace", 4], ["endurance", 4], ["intuition", 6], ["logic", 3], ["memory", 3]],
  traits: [...MAGE.traits, "empower-spell", "precise-casting", "spellbreach"],
  weapons: ["lodestaff"],
};
// --shooters: a party of four guns, one of them a Machine Gun for Suppressing Fire
const MARKSMAN: Build = {
  name: "Marksman", kind: HUMAN, origin: "intuition", ai: "fighter", potions: 2,
  wants: [...wieldSteps("sniper-rifle", 1, 1), ...traitWants("combat-instincts"), ...wieldSteps("sniper-rifle", 2, 3), ["endurance", 6], ["endurance", 15]],
  traits: ["combat-instincts", "armor-training"],
  weapons: ["sniper-rifle"], armor: ["ballistic-vest", "combat-helmet"],
};
const TROOPER: Build = {
  name: "Trooper", kind: HUMAN, origin: "grace", ai: "fighter", potions: 2,
  wants: [...wieldSteps("rifle", 1, 1), ...traitWants("combat-instincts"), ...wieldSteps("rifle", 2, 3), ["endurance", 6], ["endurance", 15]],
  traits: ["combat-instincts", "armor-training"],
  weapons: ["rifle"], armor: ["ballistic-vest", "combat-helmet"],
};
const GUNNER: Build = {
  name: "Gunner", kind: HUMAN, origin: "power", ai: "fighter", potions: 2,
  wants: [...wieldSteps("machine-gun", 1, 3), ...traitWants("armor-training"), ["endurance", 6], ...wieldSteps("pistol", 1, 2), ["endurance", 15]],
  traits: ["combat-instincts", "armor-training"],
  weapons: ["machine-gun", "pistol"], armor: ["ballistic-vest", "combat-helmet"],
};
const geared = (b: Build): Build => ({
  ...b, ammo: "penetrator-rounds",
  wants: [...b.wants.slice(0, 6), ...traitWants("called-shot", "vital-shot", "through-the-plates"), ...b.wants.slice(6)],
  traits: [...b.traits, "called-shot", "vital-shot", "through-the-plates"],
});
const SHOOTERS = process.argv.includes("--shooters");
const GEAR = process.argv.includes("--gear");
// --suppress: the Soldier also carries a Machine Gun for Suppressing Fire
const SUPPRESS = process.argv.includes("--suppress");
const withMG = (b: Build): Build => (SUPPRESS && b.name === "Soldier" ? { ...b, weapons: [...b.weapons, "machine-gun"] } : b);

const BUILDS = () => [...partyBuilds(), BANDIT, RAIDER, RIFLEMAN, MACHINE_GUNNER, SHAMAN];
const partyBuilds = () =>
  SHOOTERS
    ? GEAR ? [G_SOLDIER, geared(MARKSMAN), geared(TROOPER), geared(GUNNER)] : [SOLDIER, MARKSMAN, TROOPER, GUNNER]
    : GEAR ? [G_SOLDIER, G_KNIGHT, G_BRUISER, G_MAGE] : [SOLDIER, KNIGHT, BRUISER, MAGE];
const party = (level: number) => partyBuilds().map((b) => build(withMG(b), level, "party"));
const crowd = (b: Build, level: number, n: number) =>
  Array.from({ length: n }, (_, i) => build(b, level, "enemy", `${b.name} ${i + 1}`));

interface Scenario {
  id: string;
  title: string;
  distance: number; // meters between the sides at the start
  cover?: Partial<Record<"party" | "enemy", number>>; // Light 3 or Heavy 6 against Ranged Attacks, lost on a Round the character moves
  spread?: number; // meters between enemies, so a 5 m area doesn't catch a whole side
  ambush?: boolean; // the party strikes first: enemies are surprised (Defense 0, no Action) in Round 1, melee starts in reach
  make: () => { party: Combatant[]; enemies: Combatant[] };
}
const SCENARIOS: Scenario[] = [
  { id: "bandits-1", title: "Level 1 party vs 4 Level 1 Bandits", distance: 20, make: () => ({ party: party(1), enemies: crowd(BANDIT, 1, 4) }) },
  { id: "bandits-3", title: "Level 3 party vs 4 Level 3 Bandits", distance: 20, make: () => ({ party: party(3), enemies: crowd(BANDIT, 3, 4) }) },
  { id: "bandits-6", title: "Level 6 party vs 4 Level 6 Bandits", distance: 20, make: () => ({ party: party(6), enemies: crowd(BANDIT, 6, 4) }) },
  { id: "raiders-6", title: "Level 6 party vs 3 Level 6 Orcoid Raiders and a Goblinoid Shaman", distance: 20, make: () => ({ party: party(6), enemies: [...crowd(RAIDER, 6, 3), build(SHAMAN, 6, "enemy", "Goblinoid Shaman")] }) },
  { id: "raiders-10", title: "Level 10 party vs 3 Level 10 Orcoid Raiders and a Goblinoid Shaman", distance: 20, make: () => ({ party: party(10), enemies: [...crowd(RAIDER, 10, 3), build(SHAMAN, 10, "enemy", "Goblinoid Shaman")] }) },
  ...[6, 8, 10, 12, 15].map((L): Scenario => ({ id: `murk-${L}`, title: `Level ${L} party vs Murk Legs, head on`, distance: 20, make: () => ({ party: party(L), enemies: [murkLegs(true)] }) })),
  ...[6, 8, 10, 12].map((L): Scenario => ({ id: `murk-${L}-ambush`, title: `Level ${L} party ambushes Murk Legs`, distance: 25, ambush: true, make: () => ({ party: party(L), enemies: [murkLegs(true)] }) })),
  ...[[6, 150], [10, 150], [10, 300]].map(([L, d]): Scenario => ({ id: `firefight-${L}-${d}`, title: `Level ${L} party vs 4 Level ${L} Riflemen, ${d} m apart, both sides in Light Cover`, distance: d!, spread: 3, cover: { party: 3, enemy: 3 }, make: () => ({ party: party(L!), enemies: crowd(RIFLEMAN, L!, 4) }) })),
  { id: "firefight-10-150-heavy", title: "Level 10 party vs 4 Level 10 Riflemen, 150 m apart, both sides in Heavy Cover", distance: 150, spread: 3, cover: { party: 6, enemy: 6 }, make: () => ({ party: party(10), enemies: crowd(RIFLEMAN, 10, 4) }) },
  { id: "firefight-10-150-mg", title: "Level 10 party vs 3 Level 10 Riflemen and a Machine Gunner, 150 m apart, both sides in Light Cover", distance: 150, spread: 3, cover: { party: 3, enemy: 3 }, make: () => ({ party: party(10), enemies: [...crowd(RIFLEMAN, 10, 3), build(MACHINE_GUNNER, 10, "enemy", "Machine Gunner")] }) },
  ...([["light", 3], ["heavy", 6]] as const).map(([k, cov]): Scenario => ({ id: `skirmish-10-${k}`, title: `Level 10 party vs 3 Level 10 Riflemen and a Machine Gunner, 40 m apart, both sides in ${k === "light" ? "Light" : "Heavy"} Cover`, distance: 40, spread: 4, cover: { party: cov, enemy: cov }, make: () => ({ party: party(10), enemies: [...crowd(RIFLEMAN, 10, 3), build(MACHINE_GUNNER, 10, "enemy", "Machine Gunner")] }) })),
  { id: "firefight-10-150-open", title: "Level 10 party vs 4 Level 10 Riflemen, 150 m apart, no cover", distance: 150, spread: 3, make: () => ({ party: party(10), enemies: crowd(RIFLEMAN, 10, 4) }) },
  ...[1, 2, 3, 4].map((n): Scenario => ({ id: `sheet-bandits-1-x${n}`, title: `Level 1 party vs ${n} Bandit${n > 1 ? "s" : ""} (stat sheet)`, distance: 20, make: () => ({ party: party(1), enemies: crowd(SHEET_BANDIT, 1, n) }) })),
  ...[2, 3, 4, 6].map((n): Scenario => ({ id: `sheet-skeletons-4-x${n}`, title: `Level 4 party vs ${n} Skeletons (stat sheet)`, distance: 20, make: () => ({ party: party(4), enemies: crowd(SHEET_SKELETON, 4, n) }) })),
  ...[1, 2, 3, 4, 6, 8].map((n): Scenario => ({ id: `sheet-mercs-8-x${n}`, title: `Level 8 party vs ${n} Dreftian Mercenar${n > 1 ? "ies" : "y"} (stat sheet)`, distance: 20, make: () => ({ party: party(8), enemies: crowd(SHEET_MERCENARY, 8, n) }) })),
  ...[1, 2, 3].flatMap((L) => [1, 2].map((n): Scenario => ({ id: `boar-${L}-x${n}`, title: `Level ${L} party vs ${n} Briar Boar${n > 1 ? "s" : ""}`, distance: 20, make: () => ({ party: party(L), enemies: Array.from({ length: n }, briarBoar) }) }))),
  ...[4, 5, 6, 7, 8].map((L): Scenario => ({ id: `lurker-${L}`, title: `Level ${L} party vs a Mire Lurker that surfaces beside them`, distance: 2, make: () => ({ party: party(L), enemies: [mireLurker()] }) })),
  { id: "lurker-8-x2", title: "Level 8 party vs 2 Mire Lurkers that surface beside them", distance: 2, spread: 4, make: () => ({ party: party(8), enemies: [mireLurker(), mireLurker()] }) },
  { id: "murk-10-plain", title: "Level 10 party vs Murk Legs without Dark Haze or Fearsome, head on", distance: 20, make: () => ({ party: party(10), enemies: [murkLegs(false, false)] }) },
];

// ---------- rules ----------

const d20 = () => 1 + Math.floor(Math.random() * 20);

// Positions are on a plane, in meters. Each character's cover faces the
// enemy's starting side; an attacker more than 45° off that facing flanks it.
type Pt = { x: number; y: number };
const ptOf = (c: Combatant): Pt => ({ x: c.pos, y: c.y });
const distPt = (c: Combatant, q: Pt) => Math.hypot(c.pos - q.x, c.y - q.y);
const dist = (a: Combatant, b: Combatant) => Math.hypot(a.pos - b.pos, a.y - b.y);
const FLANK_COS = Math.cos((45 * Math.PI) / 180);
// Is the attacker inside the arc the target's cover protects?
function coveredFrom(t: Combatant, a: Combatant): boolean {
  const dx = a.pos - t.pos, dy = a.y - t.y, d = Math.hypot(dx, dy);
  if (!d) return false;
  return (dx * t.facing.x + dy * t.facing.y) / d >= FLANK_COS;
}
// Step toward a point, stopping `stopAt` meters short
function stepToward(c: Combatant, q: Pt, meters: number, stopAt = 0) {
  const dx = q.x - c.pos, dy = q.y - c.y, d = Math.hypot(dx, dy);
  const step = Math.min(meters, Math.max(0, d - stopAt));
  if (!d || !step) return;
  c.pos += (dx / d) * step;
  c.y += (dy / d) * step;
}
const up = (c: Combatant) => c.hp >= c.hpMax / 4 && c.hp > 0;
const canAct = (c: Combatant) => up(c) && !c.asleep && !c.surprised;
const status = (c: Combatant) => (c.hp <= 0 ? "Dead" : c.hp < c.hpMax / 4 ? "Incapacitated" : c.hp < c.hpMax / 2 ? "Severely Injured" : "");
const highestMental = (t: Combatant) => Math.max(t.stats.logic, t.stats.intuition, t.stats.memory);

function severity(margin: number): { name: string; mod: number } {
  if (FLAT) {
    // Bands of 3 for a flat 50/50 roll against Defense 10
    if (margin >= 9) return { name: "Critical Hit", mod: 3 };
    if (margin >= 6) return { name: "Devastating Hit", mod: 1 };
    if (margin >= 3) return { name: "Solid Hit", mod: 0 };
    if (margin >= 0) return { name: "Glancing Blow", mod: -1 };
    if (margin >= -3) return { name: "Deflected", mod: 0 };
    if (margin >= -6) return { name: "Near Miss", mod: 0 };
    if (margin >= -9) return { name: "Overextended", mod: 0 };
    return { name: "Critical Failure", mod: 0 };
  }
  if (margin >= 16) return { name: "Critical Hit", mod: 3 };
  if (margin >= 11) return { name: "Devastating Hit", mod: 1 };
  if (margin >= 6) return { name: "Solid Hit", mod: 0 };
  if (margin >= 0) return { name: "Glancing Blow", mod: -1 };
  if (margin >= -5) return { name: "Deflected", mod: 0 };
  if (margin >= -10) return { name: "Near Miss", mod: 0 };
  if (margin >= -15) return { name: "Overextended", mod: 0 };
  return { name: "Critical Failure", mod: 0 };
}

const RAGE_PER_RANK = Number(process.env.SF_RAGE ?? 2);
const PIERCE_SCALE = Number(process.env.SF_PIERCE ?? 1);

// Breach X ignores X of the target's Resistance to each damage type; extra is
// damage a spending Trait adds on a hit
function damageOf(option: Damage[], sevMod: number, t: Combatant, a: Combatant, breach = 0, extra = 0): { total: number; types: string[] } {
  let total = 0;
  const types: string[] = [];
  for (const d of option) {
    const plus = d.plus ? (d.plus === "Physical" ? a.core.physical : a.stats[d.plus.toLowerCase() as Stat] ?? 0) : 0;
    const resist = Math.max(0, (t.resist[d.type] ?? 0) + (t.defending ? t.defendResist[d.type] ?? 0 : 0) - breach);
    const dealt = Math.max(0, (d.amount ?? 0) + plus + sevMod - resist);
    if (dealt > 0) types.push(d.type);
    total += dealt;
  }
  // Rage adds a flat bonus per Barbarian Rank to weapon damage
  if (a.rage && total > 0) total += RAGE_PER_RANK * (a.ranks["barbarian"] ?? 1);
  total += extra;
  if (total > 0) total += 2 * t.injuries.organ;
  return { total, types };
}

function attackBonus(a: Combatant, w: Weapon, t?: Combatant): number {
  let b = w.bonus - (a.flatFooted ? 1 : 0) - a.frightened - 2 * a.injuries.broken - (a.under ? 6 : 0);
  if (t && a.marked === t) b += 3;
  if (t?.monster) b += a.ranks["monster-hunter"] ?? 0;
  if (w.sword && a.ranks["expert-swordsman"]) b += 1; // Expert Swordsman: +1 with swords
  return b;
}

function targetNumber(w: Weapon, t: Combatant): number {
  if (!up(t) || t.asleep || t.surprised) return 0;
  if (w.spell?.vsMental) return 5 + highestMental(t);
  if (w.spell?.vsDemeanor) return (FLAT ? 8 : 5) + t.stats.demeanor;
  // Flat-Footed -3, Frightened -1 per Rank
  return t.defense + (t.defending ? 3 + t.defendBonus + (t.shieldwall ? 4 : 0) : 0) - (t.flatFooted ? 3 : 0) - t.frightened -
    (t.prone && !w.ranged ? 3 : 0) - (t.under ? 6 : 0);
}

// Cover against Ranged Attacks: the side's cover while the target hasn't moved this Round
function coverPenalty(w: Weapon, t: Combatant, a: Combatant): number {
  if (!w.ranged || t.moved || !coveredFrom(t, a)) return 0; // flanking beats cover
  const c = currentCover[t.side] ?? 0;
  return w.ignoreLightCover && c <= 3 ? 0 : c;
}
// Flanking: another ally can reach the target in melee from a side at least 90° away. No bonus to hit any more
// (SF_FLANK_BONUS=1 restores the old +3); flanking still beats cover.
function flanking(a: Combatant, w: Weapon, t: Combatant): number {
  if (!process.env.SF_FLANK_BONUS || w.ranged || w.spell) return 0;
  const ax = a.pos - t.pos, ay = a.y - t.y;
  return current.some((f) => {
    if (f === a || f.side !== a.side || !up(f) || f.asleep || !f.weapons.some((x) => !x.ranged && dist(t, f) <= x.range)) return false;
    const fx = f.pos - t.pos, fy = f.y - t.y;
    return ax * fx + ay * fy <= 0;
  }) ? 3 : 0;
}

const priorityOf = (c: Combatant) => c.basePriority - (c.flatFooted ? 1 : 0) - c.injuries.organ - c.injuries.broken;

// Expected damage of one Attack: picks weapons, damage options and targets
function expected(a: Combatant, w: Weapon, t: Combatant, penalty: number): { dmg: number; option: Damage[] } {
  let best = { dmg: -1, option: w.options[0]! };
  if (w.area) {
    let dmg = 0;
    for (const x of current) {
      if (x === a || !up(x) || dist(x, a) > w.area) continue;
      dmg += (x.side === a.side ? -1 : 1) * damageOf(w.options[0]!, -1, x, a).total;
    }
    return { dmg, option: w.options[0]! };
  }
  const chance = (target: number) => Math.min(1, Math.max(0, (21 - target) / 20));
  for (const option of w.options) {
    const avg = (pen: number) => {
      let sum = 0;
      for (let r = 1; r <= 20; r++) {
        const margin = r + attackBonus(a, w, t) - pen - targetNumber(w, t);
        if (margin >= 0) sum += damageOf(option, severity(margin).mod, t, a, w.breach ?? 0).total;
      }
      return sum / 20;
    };
    let dmg = avg(penalty);
    // Dark Haze: until they pass, Attacks on the haze are at -6
    if (t.darkHaze && t.hazeSeen?.get(a) !== true) {
      const p = chance(10 * t.darkHaze - a.stats.intuition + (a.rage ? 10 : 0));
      dmg = p * dmg + (1 - p) * avg(penalty + 6);
    }
    // Fearsome: one Demeanor check per Incident
    if (t.fearsome && !t.fearChecked?.has(a)) dmg *= chance(13 - a.stats.demeanor + (a.rage ? 10 : 0));
    if (dmg > best.dmg) best = { dmg, option };
  }
  return best;
}
let current: Combatant[] = [];
let currentCover: Partial<Record<Combatant["side"], number>> = {};

interface Stats {
  wins: number;
  rounds: number;
  partyDown: number;
  partyDead: number;
  attacks: Record<string, { n: number; hits: number; dmg: number; crits: number }>;
  hazeBlocked: number;
  fearBlocked: number;
  injuries: number;
  roundsCapped: number;
  healed: number;
  revived: number;
  potions: number;
  sleeps: number;
  ripostes: number;
  rages: number;
  reloads: number;
  aims: number;
  suppressions: number;
  flanks: number;
  suppressed: number;
  spent: { vp: number; sp: number; mp: number; hp: number };
}

// The resource-spending Traits: [Trait, resource, what it buys, amount per point, which Attacks]
const SPENDERS: [string, "vp" | "sp" | "mp" | "hp", "ignore" | "breach" | "extra", number, (w: Weapon) => boolean][] = [
  ["feint", "vp", "ignore", 3, (w) => !w.ranged && !!w.sword],
  ["called-shot", "sp", "ignore", 3, (w) => w.ranged && !w.spell],
  ["unbalancing-strike", "vp", "ignore", 3, (w) => !!w.natural],
  ["precise-casting", "mp", "ignore", 3, (w) => !!w.spell],
  ["find-the-gap", "sp", "breach", 2, (w) => !w.ranged && !!w.blade],
  ["through-the-plates", "sp", "breach", 2, (w) => !!w.firearm],
  ["pressure-point", "sp", "breach", 3, (w) => !!w.natural],
  ["spellbreach", "mp", "breach", 2, (w) => !!w.spell],
  ["wild-swing", "vp", "extra", 3, (w) => !w.ranged && !w.natural && !w.spell],
  ["vital-shot", "sp", "extra", 3, (w) => w.ranged && !w.spell],
  ["focused-strike", "hp", "extra", 4, (w) => !!w.natural],
  ["empower-spell", "mp", "extra", 3, (w) => !!w.spell],
];

// How much to spend on an Attack: enough to-hit bonus to reach about a
// 60% hit, enough Breach to clear the target's Resistance, then damage.
// Casters keep 3 MP for Heal; nobody spends HP below half.
function spend(a: Combatant, w: Weapon, t: Combatant, option: Damage[], pen: number, st?: Stats) {
  const out = { ignore: 0, breach: 0, extra: 0 };
  if (w.spell?.onHit || t.hp <= 4) return out;
  const reserve = { vp: 0, sp: 0, mp: a.ranks["heal"] ? 3 : 0, hp: Math.ceil(a.hpMax / 2) };
  const pay = (res: "vp" | "sp" | "mp" | "hp", n: number) => {
    const can = Math.max(0, Math.min(n, a[res] - reserve[res]));
    a[res] -= can;
    if (st) st.spent[res] += can;
    return can;
  };
  let need = targetNumber(w, t) + pen - attackBonus(a, w, t); // the d20 roll that hits
  const resist = Math.max(0, ...option.map((d) => (t.resist[d.type] ?? 0) - (w.breach ?? 0)));
  for (const kind of ["ignore", "breach", "extra"] as const) {
    for (const [id, res, k, per, fits] of SPENDERS) {
      if (k !== kind || !a.ranks[id] || !fits(w)) continue;
      let want = a.ranks[id]!;
      if (kind === "ignore") want = Math.min(want, Math.max(0, Math.ceil((need - 9) / per)));
      if (kind === "breach") want = Math.min(want, Math.ceil(Math.max(0, resist - out.breach) / per));
      const got = pay(res, want);
      out[kind] += got * per;
      if (kind === "ignore") need -= got * per;
    }
  }
  return out;
}

type Plan = {
  c: Combatant;
  kind: "attack" | "flurry" | "move" | "defend" | "heal" | "potion" | "sleep" | "toward" | "reload" | "aim" | "suppress" | "flank" | "pounce" | "drag" | "struggle" | "apex";
  late?: boolean; // an Apex monster's second Action, at Priority -5
  w?: Weapon;
  t?: Combatant;
  option?: Damage[];
  heal?: { spell: string; mp: number; amount: number; range: number };
  at?: Pt; // where an area Action is centered, or where a flanker is headed
};

function fight(sc: Scenario, log?: (s: string) => void, st?: Stats): boolean {
  const { party: P, enemies: E } = sc.make();
  const sp = sc.spread ?? 0;
  E.forEach((e, i) => { e.pos = sc.distance; e.y = (i - (E.length - 1) / 2) * sp; e.facing = { x: -1, y: 0 }; });
  P.forEach((p, i) => { p.pos = 0; p.y = (i - (P.length - 1) / 2) * sp; p.facing = { x: 1, y: 0 }; });
  if (sc.ambush) {
    for (const e of E) e.surprised = true;
    for (const p of P) if (!p.weapons[0]!.ranged && p.ai !== "caster") { const e = E[0]!; p.pos = e.pos - 2; p.y = e.y; }
  }
  const all = [...P, ...E];
  current = all;
  currentCover = sc.cover ?? {};
  const foes = (c: Combatant) => (c.side === "party" ? E : P).filter(up);
  const friends = (c: Combatant) => (c.side === "party" ? P : E);
  const meleeReach = (c: Combatant) => Math.max(0, ...c.weapons.filter((w) => !w.ranged).map((w) => w.range));
  const describe = (c: Combatant) =>
    `${c.name} (HP ${c.hpMax}, Def ${c.defense}, ${c.weapons.filter((w) => !w.spell)[0]!.name} +${c.weapons.filter((w) => !w.spell)[0]!.bonus}` +
    `${c.mpMax ? `, MP ${c.mpMax}` : ""}${Object.keys(c.ranks).length ? `; ${Object.entries(c.ranks).map(([k, r]) => `${traits[k].name}${traits[k].ranked ? " " + r : ""}`).join(", ")}` : ""}${c.notes.length ? "; " + c.notes.join("; ") : ""})`;
  log?.(`Party:\n  ${P.map(describe).join("\n  ")}`);
  log?.(`Enemies:\n  ${E.map(describe).join("\n  ")}`);

  let round = 0;
  while (P.some(up) && E.some(up) && round < 30) {
    round++;
    log?.(`\n-- Round ${round}`);
    for (const c of all) {
      // Monster Traits at the start of the Round
      if (c.ambusher) c.basePriority += round === 1 ? 3 : round === 2 ? -3 : 0;
      if (c.prone && (c.proneUntil ?? 0) < round) c.prone = false;
      if (c.seizedBy && !up(c.seizedBy)) { c.seizedBy = undefined; c.under = false; }
      if (c.under && c.hp > 0) { const d = 1 + Math.floor(Math.random() * 6); c.hp -= d; log?.(`${c.name} is held under: ${d} HP (${Math.max(c.hp, 0)}/${c.hpMax})`); }
      if (c.regen && c.hp > 0 && c.hp < c.hpMax && c.heatRound !== round - 1) c.hp = Math.min(c.hpMax, c.hp + 2 * c.regen);
      c.flatFooted = c.flatNext;
      c.flatNext = false;
      c.defending = c.shieldwall = c.riposte = false;
      c.attackedThisRound = false;
      c.moved = false;
      c.pinned = !!c.pinnedNext;
      c.pinnedNext = false;
    }
    const plans: Plan[] = [];
    for (const c of all.filter(canAct)) {
      const p = decide(c, foes, friends, meleeReach, st);
      if (p) plans.push(p);
      // Apex: a second full Action, decided when its turn comes
      if (c.apex) plans.push({ c, kind: "apex", late: true });
    }
    const prioOf = (p: Plan) => priorityOf(p.c) - (p.late ? 5 : 0);
    const steps = [...new Set(plans.map(prioOf))].sort((a, b) => b - a);
    for (const step of steps) {
      const here = plans
        .filter((p) => prioOf(p) === step && canAct(p.c))
        .map((p) => (p.kind === "apex" ? decide(p.c, foes, friends, meleeReach, st) : p))
        .filter((p): p is Plan => !!p);
      // RP: potions, healing, Sleep
      for (const p of here) {
        const c = p.c;
        if (p.kind === "aim" && p.t) {
          c.aimAt = p.t;
          if (st) st.aims++;
          log?.(`${c.name} takes aim at ${p.t.name}`);
        } else if (p.kind === "reload") {
          c.mustReload.clear();
          if (st) st.reloads++;
          log?.(`${c.name} reloads`);
        } else if (p.kind === "potion") {
          c.potions--;
          c.hp = Math.min(c.hpMax, c.hp + 4);
          if (st) st.potions++;
          log?.(`${c.name} drinks a Healing Potion (${c.hp}/${c.hpMax})`);
        } else if (p.kind === "heal" && p.t && p.heal && p.t.hp > 0 && c.mp >= p.heal.mp) {
          if (dist(p.t, c) > p.heal.range) continue;
          const wasDown = !up(p.t);
          c.mp -= p.heal.mp;
          const before = p.t.hp;
          p.t.hp = Math.min(p.t.hpMax, p.t.hp + p.heal.amount);
          if (st) { st.healed += p.t.hp - before; if (wasDown && up(p.t)) st.revived++; }
          log?.(`${c.name} casts ${p.heal.spell} on ${p.t.name}: ${before} → ${p.t.hp}/${p.t.hpMax}${wasDown && up(p.t) ? ", back on their feet" : ""}`);
        }
      }
      // Defend
      for (const p of here.filter((p) => p.kind === "defend")) {
        p.c.defending = true;
        if (p.c.ranks["shield-wall"] && p.c.hp < p.c.hpMax / 2) p.c.shieldwall = true;
        else if (p.c.ranks["swordsman"]) p.c.riposte = true;
        log?.(`${p.c.name} Defends${p.c.shieldwall ? " in a Shieldwall" : p.c.riposte ? " for a Riposte" : ""} (Def ${targetNumber(p.c.weapons.find((w) => !w.spell)!, p.c)})`);
      }
      // Attacks: all resolve against Defense as it stands, then damage lands
      const hits: { t: Combatant; dmg: number; text: string; crit: boolean; types: string[]; a: Combatant; w: Weapon }[] = [];
      const counters: { a: Combatant; t: Combatant }[] = [];
      const suppressedNow: Combatant[] = [];
      const attack = (a: Combatant, w: Weapon, t: Combatant, option: Damage[], extraPenalty = 0, pouncing = false) => {
        if (!up(t)) return;
        if (dist(t, a) > w.range) { log?.(`${a.name} can't reach ${t.name}`); return; }
        if (w.spell) {
          if (a.mp < w.spell.mp) return;
          a.mp -= w.spell.mp;
        }
        a.attackedThisRound = true;
        // Fearsome: a Demeanor check the first time each character Attacks it this Incident
        if (t.fearsome && t.fearChecked && !t.fearChecked.has(a)) {
          t.fearChecked.add(a);
          if (d20() + a.stats.demeanor - (a.rage ? 10 : 0) < 13) {
            frighten(a, 3);
            if (st) st.fearBlocked++;
            log?.(`${a.name} loses their nerve facing ${t.name}${a.rage ? " (Raging, so not Frightened)" : ": Frightened 3"}`);
            return;
          }
        }
        // Dark Haze: until a character passes, they roll each Round and Attack the haze at -6
        let hazePen = 0;
        if (t.darkHaze && t.hazeSeen) {
          const s = t.hazeSeen.get(a);
          if (s !== true && s !== round) {
            const seen = d20() + a.stats.intuition - (a.rage ? 10 : 0) >= 10 * t.darkHaze;
            t.hazeSeen.set(a, seen ? true : round);
            if (!seen && st) st.hazeBlocked++;
            log?.(`${a.name} ${seen ? "makes out" : "can't make out"} ${t.name} through the Dark Haze`);
          }
          if (t.hazeSeen.get(a) !== true) hazePen = 6;
        }
        if (w.reloadFull) a.mustReload.add(w);
        const targets = w.area ? all.filter((x) => x !== a && up(x) && dist(x, a) <= w.area!) : [t];
        let spent = { ignore: 0, breach: 0, extra: 0 };
        for (const tt of targets) {
          let margin: number;
          let sev: { name: string; mod: number };
          if (w.area) {
            margin = 0;
            sev = { name: "Glancing Blow (Area)", mod: -1 };
          } else {
            let pen = extraPenalty + (tt === t ? hazePen : 0);
            if (w.ranged && dist(tt, a) > w.range / 2) pen += 2;
            if (w.ranged && !w.spell && foes(a).some((f) => !f.asleep && meleeReach(f) >= dist(f, a))) pen += 3;
            pen += coverPenalty(w, tt, a) - flanking(a, w, tt);
            if (w.ranged && !w.spell && a.aimAt === tt) { pen -= 4; a.aimAt = undefined; }
            // Resource-spending Traits, decided before the roll
            spent = spend(a, w, tt, option, pen, st);
            if (spent.ignore || spent.breach || spent.extra) log?.(`${a.name} spends for ${[spent.ignore && `+${spent.ignore} to hit`, spent.breach && `(Breach: ${spent.breach})`, spent.extra && `+${spent.extra} damage`].filter(Boolean).join(", ")}`);
            margin = d20() + attackBonus(a, w, tt) - pen - Math.max(0, targetNumber(w, tt) - spent.ignore);
            sev = severity(margin);
          }
          const rec = st && (st.attacks[`${a.side}:${w.name}`] ??= { n: 0, hits: 0, dmg: 0, crits: 0 });
          if (rec) rec.n++;
          if (margin < 0) {
            if (margin <= (FLAT ? -10 : -11)) a.flatNext = true;
            if (tt.riposte && !w.ranged && margin <= -4) counters.push({ a: tt, t: a });
            log?.(`${a.name} → ${tt.name} with ${w.name}: ${sev.name}`);
            continue;
          }
          if (w.spell?.onHit) {
            if (rec) rec.hits++;
            if (st && w.spell.id === "sleep") st.sleeps++;
            hits.push({ t: tt, dmg: 0, text: `${a.name} → ${tt.name} with ${w.name}: hit`, crit: false, types: [], a, w });
            continue;
          }
          const d = damageOf(option, sev.mod, tt, a, (w.breach ?? 0) + spent.breach, spent.extra + (a.cornered && a.hp < a.hpMax / 2 ? 2 : 0));
          // Seize and Pounce: a Solid Hit or better
          if (!w.area && sev.mod >= 0 && sev.name !== "Glancing Blow") {
            if (w.seize && !tt.seizedBy) { tt.seizedBy = a; log?.(`${tt.name} is Seized by ${a.name}`); }
            if (pouncing) { tt.prone = true; tt.proneUntil = round + 1; log?.(`${tt.name} is knocked Prone`); }
          }
          if (rec) { rec.hits++; rec.dmg += d.total; if (sev.name === "Critical Hit") rec.crits++; }
          hits.push({ t: tt, dmg: d.total, text: `${a.name} → ${tt.name} with ${w.name}: ${sev.name}, ${d.total} damage`, crit: sev.name === "Critical Hit", types: d.types, a, w });
        }
      };
      for (const p of here) {
        if ((p.kind === "attack" || p.kind === "sleep") && p.w && p.t) {
          attack(p.c, p.w, p.t, p.option ?? p.w.options[0]!);
          if (p.w.twice) attack(p.c, p.w, p.t, p.option ?? p.w.options[0]!); // Many Limbs
        }
        if (p.kind === "pounce" && p.w && p.t && up(p.t)) {
          p.c.moved = true;
          stepToward(p.c, ptOf(p.t), 12, Math.max(0.5, p.w.range - 0.5));
          log?.(`${p.c.name} Pounces on ${p.t.name}`);
          attack(p.c, p.w, p.t, p.w.options[0]!, 0, true);
        }
        if (p.kind === "drag" && p.t && p.t.seizedBy === p.c) { p.t.under = true; log?.(`${p.c.name} drags ${p.t.name} under the water`); }
        if (p.kind === "struggle") {
          const free = d20() + p.c.stats.power >= 15;
          log?.(`${p.c.name} struggles${free ? " free" : ", still held"}`);
          if (free) { p.c.seizedBy = undefined; p.c.under = false; }
        }
        if (p.kind === "suppress" && p.w && p.t && distPt(p.c, p.at ?? ptOf(p.t)) <= p.w.range) {
          // Suppressing Fire: Demeanor against 10 + 3 per Wield Rank for everyone within 2.5 m of the target
          const dc = 10 + 3 * (p.w.wieldRank ?? 0);
          const center = p.at ?? ptOf(p.t);
          const caught = all.filter((x) => up(x) && distPt(x, center) <= 2.5);
          if (p.w.reloadFull) p.c.mustReload.add(p.w);
          if (st) st.suppressions++;
          for (const x of caught) if (d20() + x.stats.demeanor - (x.rage ? 10 : 0) < dc) suppressedNow.push(x);
          log?.(`${p.c.name} lays down Suppressing Fire near ${p.t.name} (${caught.length} in the area)`);
        }
        if (p.kind === "flurry" && p.w && p.t) {
          attack(p.c, p.w, p.t, p.option ?? p.w.options[0]!, 3);
          attack(p.c, p.w, p.t, p.option ?? p.w.options[0]!, 3);
        }
      }
      const land = (list: typeof hits) => {
        for (const h of list) {
          h.t.hp -= h.dmg;
          if (h.dmg > 0 && h.types.includes("Heat")) h.t.heatRound = round;
          if (h.dmg > 0) h.t.asleep = false;
          if (h.dmg > 0) h.w.spell?.onDamage?.(h.t, h.w.spell.rank);
          h.w.spell?.onHit?.(h.t, h.w.spell.rank);
          let extra = "";
          if (h.crit && h.dmg >= h.t.hpMax / 4 && h.t.hp > 0 && d20() + h.t.stats.endurance < 10 + h.dmg) {
            if (h.types.includes("Piercing")) { h.t.injuries.organ++; extra = " — Organ Damage"; }
            else if (h.types.includes("Blunt")) { h.t.injuries.broken++; extra = " — Broken Limb"; }
            else extra = " — injured";
            if (st) st.injuries++;
          }
          log?.(`${h.text} (${h.t.name} ${Math.max(h.t.hp, 0)}/${h.t.hpMax}${status(h.t) ? ", " + status(h.t) : ""})${extra}`);
        }
      };
      land(hits);
      hits.length = 0;
      for (const x of suppressedNow) {
        x.pinnedNext = true;
        if (st) st.suppressed++;
        log?.(`${x.name} is Pinned: a Full Defend Action next Round`);
      }
      // Ripostes come in the next Priority step
      for (const k of counters) {
        if (!canAct(k.a)) continue;
        const w = k.a.weapons.find((x) => x.sword)!;
        if (st) st.ripostes++;
        log?.(`${k.a.name} Ripostes`);
        attack(k.a, w, k.t, expected(k.a, w, k.t, 0).option);
      }
      land(hits);
      // Movement
      for (const p of here.filter((p) => p.kind === "flank" && p.at && canAct(p.c))) {
        p.c.moved = true;
        stepToward(p.c, p.at!, 10);
        if (st) st.flanks++;
        log?.(`${p.c.name} moves to flank ${p.t?.name ?? ""} (${Math.round(distPt(p.c, p.at!))} m to go)`);
      }
      for (const p of here.filter((p) => (p.kind === "move" || p.kind === "toward") && canAct(p.c) && !p.c.seizedBy)) {
        const target = p.kind === "toward" && p.t ? p.t : foes(p.c).sort((x, y) => dist(x, p.c) - dist(y, p.c))[0];
        if (!target) continue;
        if (p.kind === "move" && p.c.frightened && target.fearsome) { log?.(`${p.c.name} is too Frightened to close in`); continue; }
        const reach = p.kind === "toward" ? 1 : Math.max(1, meleeReach(p.c));
        p.c.moved = true;
        stepToward(p.c, ptOf(target), 10, reach);
        log?.(`${p.c.name} moves (now ${Math.round(dist(target, p.c))} m from ${target.name})`);
      }
    }
    // End of the Round
    for (const c of all) {
      if (c.frightened) c.frightened--;
      if (c.rage && !c.attackedThisRound) { c.rage = false; log?.(`${c.name}'s Rage ends`); }
      c.surprised = false;
    }
  }
  const won = !E.some(up) && P.some(up);
  if (st) {
    if (round >= 30) st.roundsCapped++;
    if (won) st.wins++;
    st.rounds += round;
    st.partyDown += P.filter((c) => !up(c)).length;
    st.partyDead += P.filter((c) => c.hp <= 0).length;
  }
  log?.(`\n${won ? "Party wins" : E.some(up) && P.some(up) ? "Stalemate" : "Party loses"} after ${round} Rounds`);
  return won;
}

// What a character does this Round
function decide(
  c: Combatant,
  foes: (c: Combatant) => Combatant[],
  friends: (c: Combatant) => Combatant[],
  meleeReach: (c: Combatant) => number,
  st?: Stats,
): Plan | undefined {
  const targets = foes(c);
  if (!targets.length) return undefined;
  // Pinned: heads down, a Full Defend Action
  if (c.pinned) return { c, kind: "defend" };
  // Held under the water: all it can do is struggle
  if (c.under && c.seizedBy) return { c, kind: "struggle" };
  // Drag Under: a monster pulls the character it has Seized into the water
  if (c.dragUnder) {
    const held = targets.find((t) => t.seizedBy === c && !t.under);
    if (held) return { c, kind: "drag", t: held };
  }

  // Casters heal first: anyone down or below a third
  if (c.ai === "caster") {
    const hurt = friends(c).filter((f) => f.hp > 0 && f.hp < f.hpMax / 3).sort((x, y) => x.hp / x.hpMax - y.hp / y.hpMax)[0];
    const heal = c.ranks["heal"];
    if (hurt && heal) {
      // Heal: up to 1 MP per Rank, 4 HP for each MP spent
      const healMp = Math.min(heal, c.mp, Math.ceil((hurt.hpMax - hurt.hp) / 4));
      if (healMp >= 1) {
        const pick = { spell: `Heal (${healMp} MP)`, mp: healMp, amount: 4 * healMp, range: 3 * heal };
        if (dist(hurt, c) <= pick.range) return { c, kind: "heal", t: hurt, heal: pick };
        return { c, kind: "toward", t: hurt };
      }
    }
    // Sleep the most dangerous awake foe someone on this side can then hit
    if (c.ranks["sleep"] && c.mp >= 2 + (c.side === "party" ? 2 : 0)) {
      const threat = (t: Combatant) => Math.max(...t.weapons.map((w) => w.bonus + (w.options[0]![0]!.amount ?? 0)));
      const sleeper = targets
        .filter((t) => !t.asleep && dist(t, c) <= 20)
        .filter((t) => friends(c).some((f) => f !== c && canAct(f) && f.weapons.some((w) => dist(t, f) <= w.range)))
        .sort((x, y) => threat(y) - threat(x))[0];
      const spell = sleepSpell(c.core.magic, c.ranks["sleep"]);
      const hitChance = sleeper ? (21 - (targetNumber(spell, sleeper) - attackBonus(c, spell, sleeper))) / 20 : 0;
      if (sleeper && hitChance >= 0.5 && (sleeper.monster || threat(sleeper) >= 12)) return { c, kind: "sleep", t: sleeper, w: spell };
    }
  }

  // A drink when badly hurt and no healer is coming
  const healer = friends(c).some((f) => f !== c && canAct(f) && f.ranks["heal"] && f.mp >= 1);
  if (c.potions > 0 && c.hp < c.hpMax * 0.3 && !healer) return { c, kind: "potion" };

  // A Knight below half with a melee foe close by holds the line, if a heal
  // is coming or Shieldwall or Riposte makes holding worth it
  if (
    c.ai === "knight" && c.hp < c.hpMax / 2 && (healer || c.ranks["shield-wall"] || c.ranks["swordsman"]) &&
    targets.some((t) => !t.asleep && dist(t, c) <= meleeReach(t) + 1)
  ) return { c, kind: "defend" };

  // Suppressing Fire: with an automatic weapon, when it pins two or more foes that allies can shoot
  const auto = c.weapons.find((w) => w.automatic && !c.mustReload.has(w));
  if (auto && !process.env.SF_NO_SUPPRESS) {
    // The 5 m area can be centered on a foe or between two of them
    let bestSpot: { t: Combatant; at: Pt; n: number } | undefined;
    for (const t of targets) {
      const spots: Pt[] = [ptOf(t), ...targets.filter((o) => o !== t && dist(o, t) <= 5).map((o) => ({ x: (o.pos + t.pos) / 2, y: (o.y + t.y) / 2 }))];
      for (const at of spots) {
        if (distPt(c, at) > auto.range) continue;
        const n = targets.filter((x) => !x.pinnedNext && distPt(x, at) <= 2.5).length;
        if (!bestSpot || n > bestSpot.n) bestSpot = { t, at, n };
      }
    }
    // Someone has to shoot the pinned foes: an ally, or the shooter itself next Round with another gun
    const shooters = friends(c).filter((f) => canAct(f) && f.weapons.some((w) => w.ranged && !w.spell && (f !== c || w !== auto) && bestSpot && dist(bestSpot.t, f) <= w.range));
    if (bestSpot && bestSpot.n >= 2 && shooters.length) return { c, kind: "suppress", w: auto, t: bestSpot.t, at: bestSpot.at };
  }

  // Best Attack this Round
  let best: Plan & { score: number } = { c, kind: "move", score: 0 };
  let unloaded = 0; // the best a weapon that needs reloading would do
  for (const t of targets) {
    const range = dist(t, c);
    for (const w of c.weapons) {
      if (w.spell && c.mp < w.spell.mp + (c.side === "party" && c.ranks["heal"] ? 1 : 0)) continue;
      if (c.mustReload.has(w)) {
        if (range <= w.range) unloaded = Math.max(unloaded, expected(c, w, t, 0).dmg * (1 + (1 - t.hp / t.hpMax)));
        continue;
      }
      if (range > w.range) continue;
      let penalty = 0;
      if (w.ranged && range > w.range / 2) penalty += 2;
      if (w.ranged && !w.spell && targets.some((f) => !f.asleep && meleeReach(f) >= dist(f, c))) penalty += 3;
      penalty += coverPenalty(w, t, c) - flanking(c, w, t) - (w.ranged && !w.spell && c.aimAt === t ? 4 : 0);
      const ex = expected(c, w, t, penalty);
      const score = ex.dmg * (1 + (1 - t.hp / t.hpMax)) * (w.spell ? 0.8 : 1); // spells cost MP
      if (score > best.score) best = { c, kind: "attack", w, t, option: ex.option, score };
      // Flurry: two Attacks at -3
      if (w.sword && c.ranks["expert-swordsman"]) {
        const fl = expected(c, w, t, penalty + 3).dmg * 2 * (1 + (1 - t.hp / t.hpMax));
        if (fl > best.score) best = { c, kind: "flurry", w, t, option: ex.option, score: fl };
      }
    }
  }
  // Reload (a Full RP Action) when the loaded options are less than half as good
  if (unloaded > 0 && best.score < unloaded / 2) return { c, kind: "reload" };
  // Flank: when the best target has cover from here and no more than one foe who could shoot this
  // character is free to (the rest are Pinned), move to a spot 55° off the target's cover
  if (!process.env.SF_NO_FLANK && c.ai !== "caster" && best.kind === "attack" && best.w?.ranged && !best.w.spell && best.t && coverPenalty(best.w, best.t, c) > 0) {
    const t = best.t;
    const free = targets.filter((f) => !f.pinned && f.weapons.some((w) => w.ranged && dist(f, c) <= w.range)).length;
    if (free <= 1) {
      const r = Math.min(dist(c, t), best.w.range / 2, 30);
      const ang = (55 * Math.PI) / 180;
      const sides = [1, -1].map((sgn) => {
        const nx = -t.facing.y * sgn, ny = t.facing.x * sgn; // a normal to the cover's facing
        return { x: t.pos + r * (Math.cos(ang) * t.facing.x + Math.sin(ang) * nx), y: t.y + r * (Math.cos(ang) * t.facing.y + Math.sin(ang) * ny) };
      });
      const at = sides.sort((a2, b2) => distPt(c, a2) - distPt(c, b2))[0]!;
      // Only short flanks: two Rounds of Movement at most
      if (distPt(c, at) > 1 && distPt(c, at) <= 20) return { c, kind: "flank", t, at };
    }
  }
  // Aim (a Full RP Action) when a shot is a long one: the next Ranged Attack at that target gets Advantage
  if (best.kind === "attack" && best.w?.ranged && !best.w.spell && best.t && c.aimAt !== best.t) {
    const need = targetNumber(best.w, best.t) + coverPenalty(best.w, best.t, c) - attackBonus(c, best.w, best.t);
    if ((21 - need) / 20 < 0.35) return { c, kind: "aim", t: best.t };
  }
  // Pounce: out of reach, a monster closes and strikes in one Action
  const pounceW = c.weapons.find((w) => w.pounce);
  if (pounceW && best.kind === "move") {
    const near = targets.filter((t) => dist(t, c) <= 12 + pounceW.range).sort((x, y) => dist(x, c) - dist(y, c))[0];
    if (near) return { c, kind: "pounce", w: pounceW, t: near };
  }
  if (best.kind === "move" || !best.t) {
    // Casters keep their distance; everyone else closes in
    if (c.ai === "caster" && targets.some((t) => dist(t, c) <= 40)) return undefined;
    return best;
  }
  // Mark Quarry rides along as a Partial RP Action
  if (c.ranks["hunter"] && best.t.monster && !c.marked && c.sp >= 1) {
    c.sp--;
    c.marked = best.t;
  }
  // Rage when doubled damage beats the -10 it puts on Fearsome and Dark Haze checks
  if (c.ranks["barbarian"] && !c.rage && c.vp >= 1 && best.w && !best.w.ranged) {
    const calm = expected(c, best.w, best.t, 0).dmg;
    c.rage = true;
    const raging = expected(c, best.w, best.t, 0).dmg;
    c.rage = false;
    if (raging > calm) {
      c.vp--;
      c.rage = true;
      c.frightened = 0; // immune
      if (st) st.rages++;
    }
  }
  return best;
}

// ---------- run ----------

const args = process.argv.slice(2);
const N = Number(args[args.indexOf("--n") + 1]) || 2000;
const logId = args.includes("--log") ? args[args.indexOf("--log") + 1] : undefined;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
const pct = (x: number) => `${Math.round(x * 100)}%`;

// --stats knight: one build's Stats, Traits and resources at every Level, then stop
const statsFor = args.includes("--stats") ? args[args.indexOf("--stats") + 1] : undefined;
if (statsFor) {
  const b = BUILDS().find((x) => x.name.toLowerCase().replace(/ /g, "-").includes(statsFor.toLowerCase()));
  if (!b) throw new Error(`No build ${statsFor}. Try: ${BUILDS().map((x) => x.name).join(", ")}`);
  const short: Record<Stat, string> = { endurance: "End", power: "Pow", grace: "Gra", empathy: "Emp", persuasion: "Per", demeanor: "Dem", logic: "Log", intuition: "Int", memory: "Mem" };
  console.log(`# ${b.name}${EVEN && b.frontLine ? " (even)" : ""}\n`);
  console.log(["Lvl", "P/S/M/A", ...Object.values(short), "HP", "Def", "Pri", "MP", "Attack", "Traits"].join(" | "));
  for (let L = 1; L <= 20; L++) {
    const c = build(b, L, "party");
    const w = c.weapons.find((x) => !x.spell)!;
    const tr = Object.entries(c.ranks).map(([k, r]) => `${traits[k].name}${traits[k].ranked ? " " + r : ""}`).join(", ");
    console.log([L, `${c.core.physical}/${c.core.social}/${c.core.mental}/${c.core.magic}`, ...ALL_STATS.map((s) => c.stats[s]), c.hpMax, c.defense, c.basePriority, c.mpMax, `+${w.bonus}`, tr].join(" | "));
  }
  process.exit(0);
}

if (logId) {
  const sc = SCENARIOS.find((s) => s.id === logId);
  if (!sc) throw new Error(`No scenario ${logId}. Try: ${SCENARIOS.map((s) => s.id).join(", ")}`);
  console.log(`# ${sc.title}\n`);
  fight(sc, console.log);
  console.log("");
}

console.log(SHOOTERS ? `Party: Soldier, Marksman (Sniper Rifle), Trooper (Rifle) and Gunner (Machine Gun), all Human.${GEAR ? " Geared: the Soldier's Rail Rifle and Hand Cannon, Penetrator Rounds and the ranged spending Traits for the rest." : ""}
` : `Party: Soldier (rifle, monster hunter), Knight (longsword, shield), Bruiser (greatsword, plate, Barbarian), Mage (Goblinoid healer and mentalist). Human but the Mage.${EVEN ? " Front line built evenly." : ""}${GEAR ? " Geared: Rail Rifle and Hand Cannon with Penetrator Rounds, Masterwork Longsword, Vibro-Axe, Lodestaff, and the spending Traits." : ""}\n`);
for (const sc of SCENARIOS.filter((s) => (logId ? s.id === logId : !only || s.id.startsWith(only)))) {
  const st: Stats = { wins: 0, rounds: 0, partyDown: 0, partyDead: 0, attacks: {}, hazeBlocked: 0, fearBlocked: 0, injuries: 0, roundsCapped: 0, healed: 0, revived: 0, potions: 0, sleeps: 0, ripostes: 0, rages: 0, reloads: 0, aims: 0, suppressions: 0, suppressed: 0, flanks: 0, spent: { vp: 0, sp: 0, mp: 0, hp: 0 } };
  for (let i = 0; i < N; i++) fight(sc, undefined, st);
  const per = (x: number) => (x / N).toFixed(1);
  console.log(`## ${sc.title}`);
  console.log(
    `Party wins ${pct(st.wins / N)} | ${per(st.rounds)} Rounds | party down ${(st.partyDown / N).toFixed(2)} of 4 (dead ${(st.partyDead / N).toFixed(2)})` +
      (st.roundsCapped ? ` | ${st.roundsCapped} hit the 30-Round cap` : ""),
  );
  const extras = [
    st.hazeBlocked && `${per(st.hazeBlocked)} failed Dark Haze rolls`,
    st.fearBlocked && `${per(st.fearBlocked)} Attacks lost to Fearsome`,
    st.healed && `${per(st.healed)} HP healed (${per(st.revived)} revived)`,
    st.potions && `${per(st.potions)} potions`,
    st.sleeps && `${per(st.sleeps)} Sleeps`,
    st.ripostes && `${per(st.ripostes)} Ripostes`,
    st.rages && `${per(st.rages)} Rages`,
    st.reloads && `${per(st.reloads)} reloads`,
    st.aims && `${per(st.aims)} Aims`,
    st.flanks && `${per(st.flanks)} flanking moves`,
    st.suppressions && `${per(st.suppressions)} Suppressing Fires (${(st.suppressed / st.suppressions).toFixed(1)} Pinned each)`,
    (st.spent.vp || st.spent.sp || st.spent.mp || st.spent.hp) && `spent ${Object.entries(st.spent).filter(([, v]) => v).map(([k, v]) => `${per(v)} ${k.toUpperCase()}`).join(", ")}`,
    st.injuries && `${per(st.injuries)} injuries`,
  ].filter(Boolean);
  if (extras.length) console.log(`  a fight: ${extras.join(" | ")}`);
  for (const [k, r] of Object.entries(st.attacks).sort()) {
    console.log(`  ${k.padEnd(30)} ${per(r.n).padStart(5)} a fight | hit ${pct(r.hits / r.n).padStart(4)} | ${(r.hits ? r.dmg / r.hits : 0).toFixed(1).padStart(4)} dmg a hit | crit ${pct(r.crits / r.n).padStart(3)}`);
  }
  console.log("");
}

if (!logId && !only) {
  console.log("## The party by Level (HP / Defense / main Attack bonus / Priority)");
  for (const L of [1, 3, 6, 8, 10, 12, 15, 20]) {
    console.log(`  L${String(L).padEnd(3)}` + party(L).map((c) => `${c.name} ${c.hpMax}/${c.defense}/+${c.weapons.find((w) => !w.spell)!.bonus}/${c.basePriority}${c.mpMax ? ` MP ${c.mpMax}` : ""}`).join("  |  "));
  }
  console.log(`\nAssumptions:\n${ASSUMPTIONS.map((a) => "- " + a).join("\n")}`);
}
