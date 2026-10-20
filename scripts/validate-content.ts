// Checks every file under content/ against its schema and the cross-file rules
// in docs/CONTENT.md. Exits non-zero on errors; warnings are reported only.
import { loadContent } from "../src/engine/content.js";
import type { StatBlock } from "../src/schema/index.js";

// Human's budget, which every Kind is balanced against.
const START_TOTAL = 9;
const MAX_TOTAL = 135;

const { content, errors } = loadContent();
const { kinds, packages, traits } = content;
const warnings: string[] = [];

function checkBudget(label: string, stats: StatBlock) {
  const ranges = Object.values(stats);
  const start = ranges.reduce((sum, r) => sum + r.start, 0);
  const max = ranges.reduce((sum, r) => sum + r.max, 0);
  if (start !== START_TOTAL) warnings.push(`${label}: starting stats total ${start}, expected ${START_TOTAL}`);
  if (max !== MAX_TOTAL) warnings.push(`${label}: maximums total ${max}, expected ${MAX_TOTAL}`);
}

for (const kind of kinds) {
  checkBudget(`kinds/${kind.id}`, kind.stats);
}

const traitIds = new Set(traits.map((t) => t.id));
for (const pkg of packages) {
  const refs = [...pkg.grants.map((g) => g.trait), ...pkg.backgroundTraits];
  for (const ref of refs) {
    if (!traitIds.has(ref)) warnings.push(`${pkg.type} ${pkg.id}: Trait "${ref}" has no file yet`);
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
