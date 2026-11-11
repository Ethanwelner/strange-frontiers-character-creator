// Checks every file under content/ against its schema and the cross-file rules
// in docs/CONTENT.md. Exits non-zero on errors; warnings are reported only.
import { loadContent } from "../src/engine/content.js";
import { parseDamage } from "../src/engine/damage.js";
import type { StatBlock } from "../src/schema/index.js";

// Human's budget, which every Kind is balanced against.
const BONUS_TOTAL = 9;
const MAX_TOTAL = 135;

const { content, errors } = loadContent();
const { kinds, packages, traits, items } = content;
const warnings: string[] = [];

// A Kind's free bonus points count toward its bonus total. A Kind that's
// deliberately off Human's maximums says so with maxTotal.
function checkBudget(label: string, stats: StatBlock, freePoints = 0, maxTotal = MAX_TOTAL) {
  const ranges = Object.values(stats);
  const bonus = ranges.reduce((sum, r) => sum + r.bonus, 0) + freePoints;
  const max = ranges.reduce((sum, r) => sum + r.max, 0);
  if (bonus !== BONUS_TOTAL) warnings.push(`${label}: stat bonuses total ${bonus}, expected ${BONUS_TOTAL}`);
  if (max !== maxTotal) warnings.push(`${label}: maximums total ${max}, expected ${maxTotal}`);
}

const traitIds = new Set(traits.map((t) => t.id));
for (const kind of kinds) {
  checkBudget(`kinds/${kind.id}`, kind.stats, kind.freePoints, kind.maxTotal);
  for (const g of kind.grants) {
    if (!traitIds.has(g.trait)) errors.push(`kinds/${kind.id}: granted Trait "${g.trait}" doesn't exist`);
  }
}

for (const pkg of packages) {
  const refs = [...pkg.grants.map((g) => g.trait), ...pkg.backgroundTraits];
  for (const ref of refs) {
    if (!traitIds.has(ref)) warnings.push(`${pkg.type} ${pkg.id}: Trait "${ref}" has no file yet`);
  }
  // A Background Trait list is for picks, which can't buy Conveyed Traits.
  for (const ref of pkg.backgroundTraits) {
    if (traits.find((t) => t.id === ref)?.conveyed) errors.push(`${pkg.type} ${pkg.id}: Background Trait "${ref}" is Conveyed, so no pick could buy it`);
  }
}
for (const trait of traits) {
  for (const ref of trait.prerequisites) {
    if (!traitIds.has(ref)) errors.push(`traits/${trait.id}: prerequisite "${ref}" doesn't exist`);
  }
}

// An item's value needs a currency to be read in.
for (const item of items) {
  if (item.value !== undefined && !item.currency) errors.push(`items/${item.id}: value ${item.value} has no currency`);
  if (item.damage && !parseDamage(item.damage)) errors.push(`items/${item.id}: damage "${item.damage}" isn't amounts and damage types`);
  if (item.chassis) {
    const c = item.chassis;
    const points = c.stats.endurance + c.stats.power + c.stats.grace;
    if (points !== c.core * 3) errors.push(`items/${item.id}: chassis focus stats add up to ${points}; Physical ${c.core} gives ${c.core * 3}`);
    for (const ref of c.traits) if (!traitIds.has(ref)) errors.push(`items/${item.id}: chassis Trait "${ref}" doesn't exist`);
    for (const ref of c.attacks) if (!items.some((i) => i.id === ref)) errors.push(`items/${item.id}: chassis Attack "${ref}" isn't an item`);
    if (item.category !== "chassis") errors.push(`items/${item.id}: a chassis needs category chassis`);
  }
}

console.log(`${kinds.length} Kinds, ${packages.length} packages, ${traits.length} Traits, ${items.length} items`);
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error: ${e}`);
if (errors.length) process.exit(1);
console.log(errors.length || warnings.length ? "Done with warnings." : "All content valid.");
