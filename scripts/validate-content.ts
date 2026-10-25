// Checks every file under content/ against its schema and the cross-file rules
// in docs/CONTENT.md. Exits non-zero on errors; warnings are reported only.
import { loadContent } from "../src/engine/content.js";
import type { StatBlock } from "../src/schema/index.js";

// Human's budget, which every Kind is balanced against.
const BONUS_TOTAL = 9;
const MAX_TOTAL = 135;

const { content, errors } = loadContent();
const { kinds, packages, traits } = content;
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

for (const kind of kinds) {
  checkBudget(`kinds/${kind.id}`, kind.stats, kind.freePoints, kind.maxTotal);
}

const traitIds = new Set(traits.map((t) => t.id));
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

console.log(`${kinds.length} Kinds, ${packages.length} packages, ${traits.length} Traits`);
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error: ${e}`);
if (errors.length) process.exit(1);
console.log(errors.length || warnings.length ? "Done with warnings." : "All content valid.");
