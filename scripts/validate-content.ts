// Checks every file under content/ against its schema and the cross-file rules
// in docs/CONTENT.md. Exits non-zero on errors; warnings are reported only.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { parse } from "yaml";
import type { ZodType } from "zod";
import { BackgroundPackage, Kind, Trait, type StatBlock } from "../src/schema/index.js";

const ROOT = join(import.meta.dirname, "..", "content");

// Human's budget, which every Kind is balanced against.
const START_TOTAL = 9;
const MAX_TOTAL = 135;

const errors: string[] = [];
const warnings: string[] = [];

function yamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return yamlFiles(path);
    return e.name.endsWith(".yaml") ? [path] : [];
  });
}

function load<T>(folder: string, schema: ZodType<T>): T[] {
  const seen = new Map<string, string>();
  const entries: T[] = [];
  for (const file of yamlFiles(join(ROOT, folder))) {
    const where = relative(ROOT, file);
    const result = schema.safeParse(parse(readFileSync(file, "utf8")));
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${where}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    const id = (result.data as { id: string }).id;
    if (id !== basename(file, ".yaml")) errors.push(`${where}: id "${id}" doesn't match the file name`);
    if (seen.has(id)) errors.push(`${where}: id "${id}" is also used by ${seen.get(id)}`);
    seen.set(id, where);
    entries.push(result.data);
  }
  return entries;
}

function checkBudget(label: string, stats: StatBlock) {
  const ranges = Object.values(stats);
  const start = ranges.reduce((sum, r) => sum + r.start, 0);
  const max = ranges.reduce((sum, r) => sum + r.max, 0);
  if (start !== START_TOTAL) warnings.push(`${label}: starting stats total ${start}, expected ${START_TOTAL}`);
  if (max !== MAX_TOTAL) warnings.push(`${label}: maximums total ${max}, expected ${MAX_TOTAL}`);
}

const kinds = load("kinds", Kind);
const packages = ["origins", "professions", "pasts"].flatMap((f) => load(f, BackgroundPackage));
const traits = load("traits", Trait);

for (const kind of kinds) {
  if (kind.stats) checkBudget(`kinds/${kind.id}`, kind.stats);
  for (const form of kind.forms ?? []) checkBudget(`kinds/${kind.id} (${form.name})`, form.stats);
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
