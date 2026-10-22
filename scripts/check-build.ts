// Checks Build JSON files with the rules engine, the same way the AI layer
// does: unknown ids first, then validateBuild. Used when Claude Code builds a
// character in chat instead of through the API.
//
//   npm run check-build -- characters/pell.json [more.json ...]
//   npm run check-build -- --level 2 characters/pell.json
import { readFileSync } from "node:fs";
import { checkBuild } from "../src/ai/tools.js";
import { loadContent } from "../src/engine/content.js";
import { STAT_GROUPS } from "../src/schema/index.js";

const args = process.argv.slice(2);
const levelFlag = args.indexOf("--level");
const startingLevel = levelFlag >= 0 ? Number(args.splice(levelFlag, 2)[1]) : undefined;
if (args.length === 0 || (startingLevel !== undefined && !Number.isInteger(startingLevel))) {
  console.error("Usage: npm run check-build -- [--level N] <build.json> [more.json ...]");
  process.exit(1);
}

const { content, errors } = loadContent();
if (errors.length) {
  console.error(`Content has errors; run npm run validate first.\n${errors.join("\n")}`);
  process.exit(1);
}

const name = (id: string) => content.traits.find((t) => t.id === id)?.name ?? id;
let failed = 0;

for (const file of args) {
  let build: Record<string, unknown>;
  try {
    build = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.log(`✗ ${file}: can't read it as JSON (${err instanceof Error ? err.message : String(err)})`);
    failed++;
    continue;
  }
  // Like the builder's Import: the build's own level is the campaign's starting level.
  const level = startingLevel ?? (typeof build.level === "number" ? build.level : 1);
  const check = checkBuild(build, content, { startingLevel: level });
  const ok = check.legal;
  if (!ok) failed++;
  console.log(`${ok ? "✓ Legal" : "✗ Not legal"}: ${file}${build.name ? ` (${String(build.name)})` : ""}`);
  for (const i of check.unknownIds) console.log(`  unknown id  ${i.path}: ${i.message}`);
  for (const e of check.errors) console.log(`  error       ${e.path ?? ""}: ${e.message}`);
  for (const w of check.warnings) console.log(`  warning     ${w.path ?? ""}: ${w.message}`);
  const s = check.summary;
  if (s) {
    for (const [group, stats] of Object.entries(STAT_GROUPS)) {
      const g = group as keyof typeof STAT_GROUPS;
      console.log(`  ${g.padEnd(9)} core ${s.coreStats[g]} · ${stats.map((st) => `${st} ${s.stats[st]}`).join(", ")}`);
    }
    const p = s.picks;
    console.log(`  picks     universal ${p.universal.spent}/${p.universal.available}, background ${p.background.spent}/${p.background.available}`);
    console.log(`  traits    ${s.traits.map((h) => `${name(h.trait)}${h.rank > 1 ? ` ${h.rank}` : ""}`).join(", ")}`);
    if (s.backgroundList.length) console.log(`  background list  ${s.backgroundList.map(name).join(", ")}`);
  }
  console.log("");
}

process.exit(failed ? 1 : 0);
