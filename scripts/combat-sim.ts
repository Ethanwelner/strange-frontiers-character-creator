// Combat simulator: runs a party against monsters under the Incidents rules
// (portfolio_site php/rpg/rpg-incidents.php) many times and reports how the
// fights go, so the combat system's numbers can be checked.
//
//   npm run sim                  every scenario, 2,000 fights each
//   npm run sim -- --log murk-6  one scenario, plus a round-by-round log of one fight
//   npm run sim -- --n 10000     more fights per scenario
//
// Weapons, armor and Wield Traits come from content/. Characters are built the
// way the creator builds them: Kind bonuses, an Origin point, then one core
// point per Level, each giving 3 focus points. Murk Legs is the stat block on
// the site (php/rpg/lore/murk-legs.php); the other enemies are ordinary NPCs
// built from existing Kinds and Items, stand-ins until there's a bestiary.
//
// What the rules leave open, and what this script assumes, is listed under
// ASSUMPTIONS below and printed with the results.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { parseDamage, type Damage } from "../src/engine/damage.js";

const ASSUMPTIONS = [
  "Damage after Resistance can't go below 0; a Severity's damage change applies to each damage type in the Attack.",
  "Incapacitated (below a quarter of max HP) takes a character out of the fight; nobody finishes them off.",
  "Coverage-limited Resistances, like a helmet's '(head)', are ignored: there are no hit locations yet.",
  "No natural 20 or natural 1 rule; Severity comes only from the margin.",
  "Defend's +3 (and a shield's bonus) lasts the whole Round, whatever the Defender's Priority step.",
  "Fighting with no Wield Trait gets no penalty: the rules mention one but don't give a number.",
  "A Wield's +3 stays +3 at every Rank (the Trait Ranks rule multiplies a Ranked Trait's bonuses by its Rank, but the Wield text gives a flat +3).",
  "Characters take the highest Wield Rank they qualify for; the Attack Stat counts from Rank 2. Natural weapons like Fists have no Wield Skill, so they add no Stat.",
  "Ammunition and reloading aren't tracked; 'Partial' reload weapons fire every Round.",
  "Movement is on a line: fighters out of reach take Full Movement (10 m) toward the nearest foe; ranged ones in range stay put.",
  "Within a Priority step Attacks resolve before Movement, so a fighter can't close and Attack in the same step: they move one Round and Attack the next.",
  "Massive Claws (Area 3 m) is an Area of Effect: no roll, a Glancing Blow on everyone within 3 m, friend or foe.",
  "Dark Haze: a character must pass d20 + Intuition >= 10 per Rank each Round to Attack the hazed creature.",
  "Fearsome: checked before every Attack on the creature, before Dark Haze. Frightened loses a Rank at the end of each Round, and a Frightened character won't move toward a Fearsome one.",
];

// ---------- content ----------

const CONTENT = join(import.meta.dirname, "..", "content");
const readYaml = (path: string) => parse(readFileSync(path, "utf8"));
const items: Record<string, any> = Object.fromEntries(
  readdirSync(join(CONTENT, "items")).map((f) => {
    const y = readYaml(join(CONTENT, "items", f));
    return [y.id, y];
  }),
);
const wieldTraits: any[] = readdirSync(join(CONTENT, "traits", "skill"))
  .filter((f) => f.startsWith("wielder-"))
  .map((f) => readYaml(join(CONTENT, "traits", "skill", f)));

type Stat =
  | "endurance" | "power" | "grace"
  | "empathy" | "persuasion" | "demeanor"
  | "logic" | "intuition" | "memory";
type Core = "physical" | "social" | "mental";
const FOCUS: Record<Core, Stat[]> = {
  physical: ["endurance", "power", "grace"],
  social: ["empathy", "persuasion", "demeanor"],
  mental: ["logic", "intuition", "memory"],
};

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

interface Weapon {
  name: string;
  options: Damage[][];
  attackStats: string[]; // the Stats the Attack can add; the best one is used
  bonus: number; // Wield Trait and similar
  wieldRank?: number;
  ranged: boolean;
  range: number; // meters
  area?: number; // Area of Effect radius
}

interface Combatant {
  name: string;
  side: "party" | "enemy";
  level?: number;
  core: Record<Core, number>;
  stats: Record<Stat, number>;
  hpMax: number;
  hp: number;
  defense: number;
  resist: Record<string, number>;
  defendResist: Record<string, number>;
  defendBonus: number; // a shield's Defense while Defending
  priority: number;
  weapons: Weapon[];
  tactic: "attack" | "defend-when-hurt";
  darkHaze?: number; // Rank
  fearsome?: boolean;
  // state
  pos: number;
  flatFooted: number; // Rounds left
  frightened: number; // Rank
  defending: boolean;
  injuries: { organ: number; broken: number };
  notes: string[];
}

function weaponFrom(id: string, c: { stats: Record<Stat, number> }): Weapon {
  const it = items[id];
  if (!it) throw new Error(`No item ${id}`);
  const options = parseDamage(it.damage)!;
  const wield = wieldTraits.find((t) => new RegExp(`\\(${it.name}\\)`, "i").test(t.modifiers ?? ""));
  // Rank 1 needs the Trait's minimums; Rank r above 1 needs every required
  // Stat at 3 × r (Traits page, Trait Ranks). Characters take the highest
  // Rank they qualify for.
  const needs = Object.entries(wield?.minStats ?? {}) as [Stat, number][];
  let rank = 0;
  if (wield && needs.every(([s, n]) => c.stats[s] >= n)) {
    rank = 1;
    while (needs.every(([s, n]) => c.stats[s] >= Math.max(n, 3 * (rank + 1)))) rank++;
  }
  return {
    name: it.name,
    options,
    // The Attack Stat only counts from Wield Rank 2
    attackStats: rank >= 2 ? String(it.attackStat ?? "").split("/").map((s) => s.trim().toLowerCase()).filter(Boolean) : [],
    wieldRank: rank,
    bonus: rank >= 1 ? 3 : 0,
    ranged: it.attackType === "Ranged",
    range: parseFloat(it.maxRange ?? "1"),
    area: it.areaOfEffect ? parseFloat(it.areaOfEffect) : undefined,
  };
}

interface Build {
  name: string;
  kind: { bonus: Partial<Record<Stat, number>>; max: Partial<Record<Stat, number>> };
  origin: Stat;
  cores: string; // one letter per Level: P, S or M
  wants: [Stat, number][]; // focus points go to the first want not yet met
  weapons: string[];
  armor: string[];
  tactic?: Combatant["tactic"];
}

const HUMAN = {
  bonus: Object.fromEntries(Object.values(FOCUS).flat().map((s) => [s, 1])),
  max: Object.fromEntries(Object.values(FOCUS).flat().map((s) => [s, 15])),
};
const ORCOID = {
  bonus: { endurance: 2, power: 2, grace: 1, empathy: 1, persuasion: 1, demeanor: 1, logic: 0, intuition: 1, memory: 0 },
  max: { endurance: 18, power: 18, grace: 13, empathy: 14, persuasion: 15, demeanor: 15, logic: 13, intuition: 15, memory: 14 },
};

function build(b: Build, level: number, side: Combatant["side"], label?: string): Combatant {
  const stats = Object.fromEntries(Object.values(FOCUS).flat().map((s) => [s, b.kind.bonus[s] ?? 0])) as Record<Stat, number>;
  const max = (s: Stat) => b.kind.max[s] ?? 20;
  stats[b.origin] += 1;
  const core: Record<Core, number> = { physical: 0, social: 0, mental: 0 };
  for (let l = 0; l < level; l++) {
    const letter = b.cores[Math.min(l, b.cores.length - 1)]!;
    const c: Core = letter === "P" ? "physical" : letter === "S" ? "social" : "mental";
    core[c]++;
    for (let p = 0; p < 3; p++) {
      const want = b.wants.find(([s, n]) => FOCUS[c].includes(s) && stats[s] < n && stats[s] < max(s));
      const pick = want?.[0] ?? FOCUS[c].filter((s) => stats[s] < max(s)).sort((x, y) => stats[x] - stats[y])[0];
      if (pick) stats[pick]++;
    }
  }
  const resist: Record<string, number> = {};
  const defendResist: Record<string, number> = {};
  let defendBonus = 0;
  let weight = 0;
  for (const id of [...b.armor, ...b.weapons]) {
    const it = items[id];
    if (!it) throw new Error(`No item ${id}`);
    weight += it.weight ?? 0;
    const r = parseResistances(it.resistances);
    for (const [t, n] of Object.entries(r.always)) resist[t] = (resist[t] ?? 0) + n;
    for (const [t, n] of Object.entries(r.defending)) defendResist[t] = (defendResist[t] ?? 0) + n;
    const m = String(it.modifiers ?? "").match(/Defense \+(\d+) \(when Defending\)/);
    if (m) defendBonus += Number(m[1]);
  }
  const carry = 20 + 10 * core.physical;
  const priority = weight > carry / 2 ? -1 : 0;
  const notes = [];
  if (priority < 0) notes.push(`carries ${weight} of ${carry} kg: ${weight > carry ? "Encumbered" : "Lightly Encumbered"}, -1 Priority`);
  const hpMax = 10 + stats.endurance + stats.power + stats.grace;
  const c: Combatant = {
    name: label ?? `${b.name} L${level}`,
    side,
    level,
    core,
    stats,
    hpMax,
    hp: hpMax,
    defense: 10 + core.physical,
    resist,
    defendResist,
    defendBonus,
    priority,
    weapons: [],
    tactic: b.tactic ?? "attack",
    pos: 0,
    flatFooted: 0,
    frightened: 0,
    defending: false,
    injuries: { organ: 0, broken: 0 },
    notes,
  };
  c.weapons = [...b.weapons.filter((id) => items[id]?.damage), "fists"].map((id) => weaponFrom(id, c));
  return c;
}

// The Murk Legs stat block from php/rpg/lore/murk-legs.php
function murkLegs(darkHaze: boolean, fearsome = true): Combatant {
  const stats = { endurance: 10, power: 15, grace: 11, empathy: 2, persuasion: 1, demeanor: 0, logic: 1, intuition: 4, memory: 1 };
  const hpMax = 10 + 10 + 15 + 11;
  return {
    name: "Murk Legs",
    side: "enemy",
    core: { physical: 12, social: 1, mental: 2 },
    stats,
    hpMax,
    hp: hpMax,
    defense: 10 + 12,
    resist: { Blunt: 2, Slashing: 1 },
    defendResist: {},
    defendBonus: 0,
    priority: 0,
    weapons: [
      // formula "Power - 5" and "Power": the Attack Roll bonus
      { name: "Massive Claws", options: [[{ type: "Slashing", amount: 10 }]], attackStats: [], bonus: 10, ranged: false, range: 3, area: 3 },
      { name: "Horrid Bite", options: [[{ type: "Piercing", amount: 15 }]], attackStats: [], bonus: 15, ranged: false, range: 3 },
    ],
    tactic: "attack",
    darkHaze: darkHaze ? 2 : undefined,
    fearsome,
    pos: 0,
    flatFooted: 0,
    frightened: 0,
    defending: false,
    injuries: { organ: 0, broken: 0 },
    notes: [],
  };
}

// ---------- party and enemy builds ----------

// Each build heads for its Wield's Rank 1 minimums, then Rank 2 (6 in every
// required Stat), then its Attack Stat. The Mental or Social Levels in `cores`
// are the ones its Wield needs.
const SOLDIER: Build = {
  name: "Soldier", kind: HUMAN, origin: "grace", cores: "PMPPMPPPPPPPPPP",
  wants: [["grace", 3], ["power", 2], ["intuition", 3], ["grace", 6], ["power", 6], ["intuition", 6], ["endurance", 5], ["grace", 15], ["endurance", 15], ["power", 15]],
  weapons: ["rifle"], armor: ["ballistic-vest", "combat-helmet"],
};
const KNIGHT: Build = {
  name: "Knight", kind: HUMAN, origin: "power", cores: "PPMPPMPPPPPPPPP",
  wants: [["grace", 4], ["power", 4], ["memory", 4], ["grace", 6], ["power", 6], ["memory", 6], ["grace", 15], ["endurance", 15]],
  weapons: ["longsword"], armor: ["chainmail", "wooden-shield"], tactic: "defend-when-hurt",
};
const BRUISER: Build = {
  name: "Bruiser", kind: HUMAN, origin: "power", cores: "PPSPPSPPPPPPPPP",
  wants: [["power", 5], ["grace", 3], ["demeanor", 4], ["power", 6], ["grace", 6], ["demeanor", 6], ["power", 15], ["endurance", 15], ["grace", 15]],
  weapons: ["greatsword"], armor: ["plate-armor"],
};
const SMUGGLER: Build = {
  // Built like Edwin Humble: a face with a pistol
  name: "Smuggler", kind: HUMAN, origin: "grace", cores: "PSMSMPSMSPSMSMS",
  wants: [["grace", 3], ["intuition", 2], ["grace", 6], ["intuition", 6], ["grace", 15], ["persuasion", 10], ["intuition", 10]],
  weapons: ["pistol"], armor: ["leather-jacket"],
};
const BANDIT: Build = {
  name: "Bandit", kind: HUMAN, origin: "grace", cores: "PPMPPMPP",
  wants: [["grace", 3], ["power", 3], ["intuition", 2], ["grace", 6], ["power", 6], ["intuition", 6], ["grace", 15], ["power", 15]],
  weapons: ["spear"], armor: ["leather-armor"],
};
const RAIDER: Build = {
  name: "Orcoid Raider", kind: ORCOID, origin: "power", cores: "PSPPSPPPPPPP",
  wants: [["power", 5], ["grace", 3], ["demeanor", 4], ["power", 6], ["grace", 6], ["demeanor", 6], ["power", 18], ["endurance", 18]],
  weapons: ["greatsword"], armor: ["hide-armor"],
};

const party = (level: number) => [SOLDIER, KNIGHT, BRUISER, SMUGGLER].map((b) => build(b, level, "party"));
const crowd = (b: Build, level: number, n: number) =>
  Array.from({ length: n }, (_, i) => build(b, level, "enemy", `${b.name} ${i + 1}`));

interface Scenario {
  id: string;
  title: string;
  distance: number; // meters between the sides at the start
  make: () => { party: Combatant[]; enemies: Combatant[] };
}
const SCENARIOS: Scenario[] = [
  { id: "bandits-1", title: "Level 1 party vs 4 Level 1 Bandits (spears), 20 m", distance: 20, make: () => ({ party: party(1), enemies: crowd(BANDIT, 1, 4) }) },
  { id: "bandits-3", title: "Level 3 party vs 4 Level 3 Bandits, 20 m", distance: 20, make: () => ({ party: party(3), enemies: crowd(BANDIT, 3, 4) }) },
  { id: "raiders-3", title: "Level 3 party vs 2 Level 5 Orcoid Raiders (greatswords), 20 m", distance: 20, make: () => ({ party: party(3), enemies: crowd(RAIDER, 5, 2) }) },
  { id: "raiders-6", title: "Level 6 party vs 4 Level 6 Orcoid Raiders, 20 m", distance: 20, make: () => ({ party: party(6), enemies: crowd(RAIDER, 6, 4) }) },
  { id: "murk-1", title: "Level 1 party vs Murk Legs (Dark Haze, Fearsome), 20 m", distance: 20, make: () => ({ party: party(1), enemies: [murkLegs(true)] }) },
  { id: "murk-3", title: "Level 3 party vs Murk Legs (Dark Haze, Fearsome), 20 m", distance: 20, make: () => ({ party: party(3), enemies: [murkLegs(true)] }) },
  { id: "murk-6", title: "Level 6 party vs Murk Legs (Dark Haze, Fearsome), 20 m", distance: 20, make: () => ({ party: party(6), enemies: [murkLegs(true)] }) },
  { id: "murk-6-fear", title: "Level 6 party vs Murk Legs (Fearsome only), 20 m", distance: 20, make: () => ({ party: party(6), enemies: [murkLegs(false)] }) },
  { id: "murk-6-haze", title: "Level 6 party vs Murk Legs (Dark Haze only), 20 m", distance: 20, make: () => ({ party: party(6), enemies: [murkLegs(true, false)] }) },
  { id: "murk-6-plain", title: "Level 6 party vs Murk Legs (neither), 20 m", distance: 20, make: () => ({ party: party(6), enemies: [murkLegs(false, false)] }) },
  { id: "murk-10", title: "Level 10 party vs Murk Legs (Dark Haze, Fearsome), 20 m", distance: 20, make: () => ({ party: party(10), enemies: [murkLegs(true)] }) },
  { id: "murk-15", title: "Level 15 party vs Murk Legs (Dark Haze, Fearsome), 20 m", distance: 20, make: () => ({ party: party(15), enemies: [murkLegs(true)] }) },
];

// ---------- rules ----------

const d20 = () => 1 + Math.floor(Math.random() * 20);
const up = (c: Combatant) => c.hp >= c.hpMax / 4 && c.hp > 0;
const status = (c: Combatant) => (c.hp <= 0 ? "Dead" : c.hp < c.hpMax / 4 ? "Incapacitated" : c.hp < c.hpMax / 2 ? "Severely Injured" : "");

function severity(margin: number): { name: string; mod: number } {
  if (margin >= 16) return { name: "Critical Hit", mod: 3 };
  if (margin >= 11) return { name: "Devastating Hit", mod: 1 };
  if (margin >= 6) return { name: "Solid Hit", mod: 0 };
  if (margin >= 0) return { name: "Glancing Blow", mod: -1 };
  if (margin >= -5) return { name: "Deflected", mod: 0 };
  if (margin >= -10) return { name: "Near Miss", mod: 0 };
  if (margin >= -15) return { name: "Overextended", mod: 0 };
  return { name: "Critical Failure", mod: 0 };
}

function damageOf(option: Damage[], sevMod: number, target: Combatant, attacker: Combatant): { total: number; types: string[] } {
  let total = 0;
  const types: string[] = [];
  for (const d of option) {
    const plus = d.plus ? (d.plus === "Physical" ? attacker.core.physical : attacker.stats[d.plus.toLowerCase() as Stat] ?? 0) : 0;
    const resist = (target.resist[d.type] ?? 0) + (target.defending ? target.defendResist[d.type] ?? 0 : 0);
    const dealt = Math.max(0, (d.amount ?? 0) + plus + sevMod - resist);
    if (dealt > 0) types.push(d.type);
    total += dealt;
  }
  if (total > 0) total += 2 * target.injuries.organ;
  return { total, types };
}

const attackBonus = (a: Combatant, w: Weapon) =>
  w.bonus +
  Math.max(0, ...w.attackStats.map((s) => (s === "physical" ? a.core.physical : a.stats[s as Stat] ?? 0))) -
  a.flatFooted -
  a.frightened -
  2 * a.injuries.broken;

const defenseOf = (t: Combatant) => (up(t) ? t.defense + (t.defending ? 3 + t.defendBonus : 0) : 0);

// Expected damage of one Attack, to pick weapons, damage options and targets
function expected(a: Combatant, w: Weapon, t: Combatant, penalty: number): { dmg: number; option: Damage[] } {
  let best = { dmg: -1, option: w.options[0]! };
  for (const option of w.options) {
    let sum = 0;
    for (let r = 1; r <= 20; r++) {
      const margin = r + attackBonus(a, w) - penalty - defenseOf(t);
      if (margin >= 0) sum += damageOf(option, severity(margin).mod, t, a).total;
    }
    if (sum / 20 > best.dmg) best = { dmg: sum / 20, option };
  }
  return best;
}

// An Area of Effect hits everyone in range as a Glancing Blow, friends included
function areaExpected(a: Combatant, w: Weapon): { dmg: number; option: Damage[] } {
  const option = w.options[0]!;
  let dmg = 0;
  for (const x of current) {
    if (x === a || !up(x) || Math.abs(x.pos - a.pos) > w.area!) continue;
    dmg += (x.side === a.side ? -1 : 1) * damageOf(option, -1, x, a).total;
  }
  return { dmg, option };
}
let current: Combatant[] = [];

interface Stats {
  wins: number;
  rounds: number;
  partyDown: number;
  partyDead: number;
  attacks: Record<string, { n: number; hits: number; dmg: number; crits: number; blocked: number }>;
  hazeBlocked: number;
  fearBlocked: number;
  injuries: number;
  roundsCapped: number;
}

function fight(sc: Scenario, log?: (s: string) => void, st?: Stats): boolean {
  const { party: P, enemies: E } = sc.make();
  for (const e of E) e.pos = sc.distance;
  const all = [...P, ...E];
  current = all;
  const foes = (c: Combatant) => (c.side === "party" ? E : P).filter(up);
  log?.(`Party: ${P.map((c) => `${c.name} (HP ${c.hpMax}, Def ${c.defense}, ${c.weapons[0]!.name} +${attackBonus(c, c.weapons[0]!)}${c.notes.length ? "; " + c.notes.join("; ") : ""})`).join(", ")}`);
  log?.(`Enemies: ${E.map((c) => `${c.name} (HP ${c.hpMax}, Def ${c.defense})`).join(", ")}`);

  let round = 0;
  while (P.some(up) && E.some(up) && round < 30) {
    round++;
    log?.(`\n-- Round ${round}`);
    // Declarations
    type Plan = { c: Combatant; kind: "attack" | "move" | "defend"; w?: Weapon; t?: Combatant; option?: Damage[]; halfMove?: boolean; seen?: boolean };
    const plans: Plan[] = [];
    for (const c of all.filter(up)) {
      c.defending = false;
      const targets = foes(c);
      if (!targets.length) continue;
      if (c.tactic === "defend-when-hurt" && c.hp < c.hpMax / 2 && targets.some((t) => !t.weapons.every((w) => w.ranged) && Math.abs(t.pos - c.pos) <= 13)) {
        c.defending = true;
        // Defenders still swing back if something is in reach: Defend has no Attack, so they just hold
        plans.push({ c, kind: "defend" });
        continue;
      }
      // Best weapon and target reachable now, or after a half move (melee)
      let best: Plan & { dmg: number } = { c, kind: "move", dmg: -1 };
      for (const t of targets) {
        const dist = Math.abs(t.pos - c.pos);
        for (const w of c.weapons) {
          let penalty = 0;
          let halfMove = false;
          if (w.ranged) {
            if (dist > w.range) continue;
            if (dist > w.range / 2) penalty += 2;
            if (foes(c).some((f) => !f.weapons.every((x) => x.ranged) && Math.abs(f.pos - c.pos) <= Math.max(...f.weapons.filter((x) => !x.ranged).map((x) => x.range)))) penalty += 3;
          } else if (dist > w.range) {
            // Attacks resolve before Movement in a Priority step, so a melee
            // fighter has to already be in reach: see ASSUMPTIONS
            continue;
          }
          const ex = w.area ? areaExpected(c, w) : expected(c, w, t, penalty);
          // Focus fire: favor the most hurt target
          const score = ex.dmg * (1 + (1 - t.hp / t.hpMax));
          if (score > best.dmg) best = { c, kind: "attack", w, t, option: ex.option, halfMove, dmg: score };
        }
      }
      plans.push(best);
    }
    // Priority steps, highest first
    const steps = [...new Set(plans.map((p) => p.c.priority - (p.c.flatFooted ? 1 : 0) - p.c.injuries.organ - p.c.injuries.broken))].sort((a, b) => b - a);
    for (const c of all) if (c.flatFooted) c.flatFooted--;
    for (const step of steps) {
      const here = plans.filter((p) => p.c.priority - (p.c.flatFooted ? 1 : 0) - p.c.injuries.organ - p.c.injuries.broken === step && up(p.c));
      // Attacks in a step are simultaneous: work out all of them, then apply damage
      const hits: { t: Combatant; dmg: number; text: string; crit: boolean; types: string[]; a: Combatant }[] = [];
      for (const p of here) {
        if (p.kind === "defend") { log?.(`${p.c.name} Defends (Def ${defenseOf(p.c)})`); continue; }
        if (p.kind === "move") continue; // after the Attacks, below
        const { c: a, w, t } = p as Required<Plan>;
        if (!up(t)) continue;
        if (Math.abs(t.pos - a.pos) > w.range) { log?.(`${a.name} can't reach ${t.name}`); continue; }
        // Fearsome: a Demeanor check of 13 to Attack, or the Attack fails and Frightened 3
        if (t.fearsome && d20() + a.stats.demeanor < 13) {
          a.frightened = Math.max(a.frightened, 3);
          if (st) st.fearBlocked++;
          log?.(`${a.name} loses their nerve facing ${t.name}: Frightened 3`);
          continue;
        }
        // Dark Haze: can't Attack what you can't make sense of
        if (t.darkHaze && d20() + a.stats.intuition < 10 * t.darkHaze) {
          if (st) st.hazeBlocked++;
          log?.(`${a.name} can't make out ${t.name} through the Dark Haze`);
          continue;
        }
        const targets = w.area ? all.filter((x) => x !== a && up(x) && Math.abs(x.pos - a.pos) <= w.area!) : [t];
        for (const tt of targets) {
          let margin: number;
          let sev: { name: string; mod: number };
          if (w.area) {
            margin = 0;
            sev = { name: "Glancing Blow (Area)", mod: -1 };
          } else {
            const pen = w.ranged ? (Math.abs(tt.pos - a.pos) > w.range / 2 ? 2 : 0) : 0;
            margin = d20() + attackBonus(a, w) - pen - defenseOf(tt);
            sev = severity(margin);
          }
          const rec = st && (st.attacks[`${a.side}:${w.name}`] ??= { n: 0, hits: 0, dmg: 0, crits: 0, blocked: 0 });
          if (rec) rec.n++;
          if (margin < 0) {
            if (margin <= -11) a.flatFooted = 1;
            log?.(`${a.name} → ${tt.name} with ${w.name}: ${sev.name}`);
            continue;
          }
          const d = damageOf(p.option ?? w.options[0]!, sev.mod, tt, a);
          if (rec) { rec.hits++; rec.dmg += d.total; if (sev.name === "Critical Hit") rec.crits++; if (d.total === 0) rec.blocked++; }
          hits.push({ t: tt, dmg: d.total, text: `${a.name} → ${tt.name} with ${w.name}: ${sev.name}, ${d.total} damage`, crit: sev.name === "Critical Hit", types: d.types, a });
        }
      }
      for (const h of hits) {
        h.t.hp -= h.dmg;
        let extra = "";
        // Critical Hit injuries
        if (h.crit && h.dmg >= h.t.hpMax / 4 && h.t.hp > 0 && d20() + h.t.stats.endurance < 10 + h.dmg) {
          if (h.types.includes("Piercing")) { h.t.injuries.organ++; extra = " — Organ Damage"; }
          else if (h.types.includes("Blunt")) { h.t.injuries.broken++; extra = " — Broken Limb"; }
          else extra = " — Scarred";
          if (st) st.injuries++;
        }
        log?.(`${h.text} (${h.t.name} ${Math.max(h.t.hp, 0)}/${h.t.hpMax}${status(h.t) ? ", " + status(h.t) : ""})${extra}`);
      }
      // Movement comes last in the step
      for (const p of here.filter((p) => p.kind === "move" && up(p.c))) {
        const target = foes(p.c).sort((x, y) => Math.abs(x.pos - p.c.pos) - Math.abs(y.pos - p.c.pos))[0];
        if (!target) continue;
        // Frightened: can't willingly Move closer to the source of its fear
        if (p.c.frightened && target.fearsome) { log?.(`${p.c.name} is too Frightened to close in`); continue; }
        moveToward(p.c, target, 10);
        log?.(`${p.c.name} moves (now ${Math.abs(target.pos - p.c.pos)} m from ${target.name})`);
      }
    }
    // Frightened loses a Rank at the end of each Round
    for (const c of all) if (c.frightened) c.frightened--;
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

function moveToward(c: Combatant, t: Combatant, m: number) {
  const dist = t.pos - c.pos;
  const reach = Math.max(1, ...c.weapons.filter((w) => !w.ranged).map((w) => w.range));
  const step = Math.min(m, Math.max(0, Math.abs(dist) - reach));
  c.pos += Math.sign(dist) * step;
}

// ---------- run ----------

const args = process.argv.slice(2);
const N = Number(args[args.indexOf("--n") + 1]) || 2000;
const logId = args.includes("--log") ? args[args.indexOf("--log") + 1] : undefined;
const pct = (x: number) => `${Math.round(x * 100)}%`;

// --stats Knight: one build's Stats at every Level, then stop
const statsFor = args.includes("--stats") ? args[args.indexOf("--stats") + 1] : undefined;
if (statsFor) {
  const b = [SOLDIER, KNIGHT, BRUISER, SMUGGLER, BANDIT, RAIDER].find((x) => x.name.toLowerCase().startsWith(statsFor.toLowerCase()));
  if (!b) throw new Error(`No build ${statsFor}`);
  const short = { endurance: "End", power: "Pow", grace: "Gra", empathy: "Emp", persuasion: "Per", demeanor: "Dem", logic: "Log", intuition: "Int", memory: "Mem" };
  console.log(["Lvl", "P/S/M", ...Object.values(short), "HP", "Def", "Rank", "Atk"].join(" | "));
  for (let L = 1; L <= 20; L++) {
    const c = build(b, L, "party");
    const w = c.weapons[0]!;
    console.log([L, `${c.core.physical}/${c.core.social}/${c.core.mental}`, ...Object.keys(short).map((s) => c.stats[s as Stat]), c.hpMax, c.defense, w.wieldRank, `+${attackBonus(c, w)}`].join(" | "));
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

console.log("Party: Soldier (rifle, ballistic vest), Knight (longsword, shield, chainmail), Bruiser (greatsword, plate), Smuggler (pistol, leather jacket). All Human.\n");
for (const sc of logId ? SCENARIOS.filter((s) => s.id === logId) : SCENARIOS) {
  const st: Stats = { wins: 0, rounds: 0, partyDown: 0, partyDead: 0, attacks: {}, hazeBlocked: 0, fearBlocked: 0, injuries: 0, roundsCapped: 0 };
  for (let i = 0; i < N; i++) fight(sc, undefined, st);
  console.log(`## ${sc.title}`);
  console.log(`Party wins ${pct(st.wins / N)} | ${(st.rounds / N).toFixed(1)} Rounds | party members down ${(st.partyDown / N).toFixed(2)} of 4 (dead ${(st.partyDead / N).toFixed(2)})${st.roundsCapped ? ` | ${st.roundsCapped} hit the 30-Round cap` : ""}${st.hazeBlocked ? ` | ${(st.hazeBlocked / N).toFixed(1)} Attacks a fight lost to Dark Haze` : ""}${st.fearBlocked ? ` | ${(st.fearBlocked / N).toFixed(1)} lost to Fearsome` : ""}${st.injuries ? ` | ${(st.injuries / N).toFixed(2)} injuries a fight` : ""}`);
  for (const [k, r] of Object.entries(st.attacks).sort()) {
    console.log(`  ${k.padEnd(28)} hit ${pct(r.hits / r.n).padStart(4)} | ${(r.hits ? r.dmg / r.hits : 0).toFixed(1).padStart(4)} dmg a hit | crit ${pct(r.crits / r.n).padStart(3)} | hits doing 0: ${pct(r.hits ? r.blocked / r.hits : 0)}`);
  }
  console.log("");
}

// Characters at each Level, for reading the numbers above
console.log("## The party by Level (HP / Defense / main Attack bonus / Wield Rank)");
for (const L of [1, 2, 3, 4, 5, 6, 8, 10, 15]) {
  console.log(`  L${String(L).padEnd(3)}` + party(L).map((c) => `${c.name.split(" ")[0]} ${c.hpMax}/${c.defense}/+${attackBonus(c, c.weapons[0]!)}/R${c.weapons[0]!.wieldRank}${c.priority < 0 ? " (-1 Pri)" : ""}`).join("  |  "));
}
console.log(`\nAssumptions:\n${ASSUMPTIONS.map((a) => "- " + a).join("\n")}`);
