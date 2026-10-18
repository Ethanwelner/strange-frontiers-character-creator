// Runs the sample prompts in evals/prompts.md against the real Claude API and
// reports, for each, whether the build is legal and what Claude made, so the
// theme can be judged by eye. Needs ANTHROPIC_API_KEY in .env.
//
//   npm run eval              every prompt
//   npm run eval -- goblin    only prompts whose heading contains "goblin"
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describeCharacter } from "../src/ai/loop.js";
import type { DescribeResult } from "../src/ai/types.js";
import { loadContent } from "../src/engine/content.js";

const PROMPTS = new URL("../evals/prompts.md", import.meta.url);
const RESULTS = new URL("../evals/results/", import.meta.url);

try {
  process.loadEnvFile();
} catch {
  // No .env; checked below.
}
if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error("No Anthropic API key found. Add ANTHROPIC_API_KEY=your-key to .env (see .env.example), then run npm run eval again.");
  process.exit(1);
}

interface Prompt {
  title: string;
  description: string;
  expect?: { kind: string; form?: string };
}

function parsePrompts(md: string): Prompt[] {
  return md
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const [title = "", ...rest] = chunk.split("\n");
      const expectLine = rest.find((l) => /^Expect:/i.test(l.trim()));
      const [kind, form] = expectLine ? expectLine.replace(/^\s*Expect:/i, "").trim().split(/\s+/) : [];
      const description = rest
        .filter((l) => l !== expectLine)
        .join("\n")
        .trim();
      return { title: title.trim(), description, expect: kind ? { kind, form } : undefined };
    })
    .filter((p) => p.description);
}

const { content, errors } = loadContent();
if (errors.length) {
  console.error(`Content has errors; run npm run validate first.\n${errors.join("\n")}`);
  process.exit(1);
}
const name = (id: unknown, list: { id: string; name: string }[]) => list.find((x) => x.id === id)?.name ?? String(id);

const filter = process.argv.slice(2).join(" ").toLowerCase();
const prompts = parsePrompts(readFileSync(PROMPTS, "utf8")).filter((p) => !filter || p.title.toLowerCase().includes(filter));
if (prompts.length === 0) {
  console.error(filter ? `No prompt heading contains "${filter}".` : "No prompts found in evals/prompts.md.");
  process.exit(1);
}

const client = new Anthropic();
const report: string[] = [`# Eval run ${new Date().toISOString()}`, ""];
let passed = 0;

for (const [i, p] of prompts.entries()) {
  const head = `[${i + 1}/${prompts.length}] ${p.title}`;
  process.stdout.write(`${head} … `);
  const started = Date.now();
  let result: DescribeResult;
  try {
    result = await describeCharacter({ description: p.description, content, create: (params) => client.beta.messages.create(params) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`FAIL (error: ${message})`);
    report.push(`## FAIL · ${p.title}`, "", `> ${p.description}`, "", `Error: ${message}`, "");
    continue;
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const check = result.check;
  const ok = result.status === "accepted" && check?.accepted === true;
  if (ok) passed++;
  const b = (result.build ?? {}) as Record<string, unknown>;
  const kindMatches = !p.expect || (b.kind === p.expect.kind && (!p.expect.form || b.form === p.expect.form));
  const open = check?.openChoices.map((c) => `${c.count} ${c.from} (${c.package})`).join(", ");
  const verdict = ok ? `PASS${open ? `, player records: ${open}` : ""}` : `FAIL (${result.status})`;
  const u = result.usage;
  const stats = `${result.turns} turns, ${seconds}s, ${u.inputTokens} in / ${u.cacheReadTokens} cached / ${u.outputTokens} out`;
  console.log(`${verdict}${kindMatches ? "" : " · KIND MISMATCH"} · ${stats}`);

  const kind = `${name(b.kind, content.kinds)}${b.form ? ` (${String(b.form)})` : ""}`;
  const packages = ["origin", "profession", "past"].map((s) => name(b[s], content.packages)).join(" · ");
  const traits = (Array.isArray(b.traits) ? b.traits : []).map((t) => `${name(t.trait, content.traits)}${t.rank > 1 ? ` ${t.rank}` : ""}`);
  console.log(`  ${b.name ? `${String(b.name)}: ` : ""}${kind} · ${packages}`);
  if (result.summary) console.log(`  ${result.summary}`);

  report.push(`## ${verdict} · ${p.title}`, "", `> ${p.description.replace(/\n/g, "\n> ")}`, "");
  if (!kindMatches) report.push(`**Kind mismatch:** expected ${p.expect!.kind}${p.expect!.form ? ` ${p.expect!.form}` : ""}, got ${kind}.`, "");
  report.push(`**${b.name ? `${String(b.name)}, ` : ""}${kind}** · ${packages}`, "");
  if (result.summary) report.push(result.summary, "");
  report.push(`Traits: ${traits.join(", ") || "none"}`, "");
  for (const r of result.reasons) report.push(`- **${r.target}**: ${r.reason}`);
  if (!ok && check) {
    report.push("", "Still wrong:");
    for (const e of [...check.unknownIds, ...check.errors]) report.push(`- ${e.message}`);
  }
  report.push("", `_${stats}_`, "");
}

mkdirSync(RESULTS, { recursive: true });
const file = new URL(`${new Date().toISOString().replace(/[:.]/g, "-")}.md`, RESULTS);
writeFileSync(file, report.join("\n"));
console.log(`\n${passed}/${prompts.length} legal. Full report with reasons: evals/results/${file.pathname.split("/").pop()}`);
process.exit(passed === prompts.length ? 0 : 1);
