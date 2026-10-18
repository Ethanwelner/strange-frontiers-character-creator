// The describe → build → validate → repair loop. The model proposes builds
// through tools; the engine checks every one, and the loop ends when a
// submitted build is accepted or the turn limit is reached. Which model runs
// it is up to the Provider (anthropic.ts, ollama.ts).
import type { BuildInput, Campaign } from "../engine/build.js";
import { DEFAULT_CAMPAIGN } from "../engine/build.js";
import type { Content } from "../engine/parse.js";
import type { Provider, ToolResult } from "./model.js";
import { contentIndex, INSTRUCTIONS } from "./prompt.js";
import { checkBuild, runTool, ToolError } from "./tools.js";
import type { BuildCheck, DescribeResult, Reason, Usage } from "./types.js";

export interface DescribeOptions {
  description: string;
  content: Content;
  provider: Provider;
  campaign?: Campaign;
  maxTurns?: number;
  // Called with each turn's tool calls, for tracing (npm run eval -- --trace).
  onTurn?: (turn: number, calls: { name: string; input: unknown }[]) => void;
}

const REASONLESS = new Set(["name", "level", "choices", "traits"]);

// Every choice needs a reason, and every reason must point at something the
// build actually contains.
function reasonProblems(build: Record<string, unknown>, reasons: Reason[]): string[] {
  const targets = new Set<string>();
  for (const key of ["kind", "form", "origin", "profession", "past"]) if (typeof build[key] === "string") targets.add(key);
  targets.add("levels");
  for (const p of Array.isArray(build.traits) ? build.traits : []) if (typeof p?.trait === "string") targets.add(p.trait);
  for (const a of Array.isArray(build.choices) ? build.choices : []) targets.add(`choice:${a?.package}/${a?.from}`);
  const given = new Set(reasons.map((r) => r.target));
  const missing = [...targets].filter((t) => !given.has(t));
  const stray = [...given].filter((t) => !targets.has(t) && !REASONLESS.has(t));
  const problems: string[] = [];
  if (missing.length) problems.push(`Add a reason for: ${missing.join(", ")}.`);
  if (stray.length) problems.push(`These reasons don't match anything in the build: ${stray.join(", ")}.`);
  return problems;
}

function parseReasons(v: unknown): Reason[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r) => typeof r?.target === "string" && typeof r?.reason === "string")
    .map((r) => ({ target: r.target as string, reason: (r.reason as string).trim() }));
}

const asBuild = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

export async function describeCharacter(opts: DescribeOptions): Promise<DescribeResult> {
  const { content, provider } = opts;
  const campaign = opts.campaign ?? DEFAULT_CAMPAIGN;
  const maxTurns = opts.maxTurns ?? provider.maxTurns;
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

  // The fixed instructions and content index come first, so they can be
  // cached; the per-request values go in the first user message.
  const session = provider.start({
    instructions: INSTRUCTIONS,
    index: contentIndex(content),
    user:
      `The campaign starts characters at level ${campaign.startingLevel}.\n\n` +
      `<player_description>\n${opts.description.trim()}\n</player_description>`,
  });

  // The most recent build the model proposed, returned if the turn limit hits.
  let last: { build: Record<string, unknown>; check: BuildCheck; summary?: string; reasons: Reason[] } | undefined;
  const done = (status: DescribeResult["status"], turns: number): DescribeResult => ({
    status,
    model: provider.model,
    build: last?.build as BuildInput | undefined,
    summary: last?.summary,
    reasons: last?.reasons ?? [],
    check: last?.check,
    turns,
    usage,
  });

  for (let turn = 1; turn <= maxTurns; turn++) {
    const { calls, usage: u } = await session.send();
    opts.onTurn?.(turn, calls);
    usage.inputTokens += u.inputTokens ?? 0;
    usage.outputTokens += u.outputTokens ?? 0;
    usage.cacheReadTokens += u.cacheReadTokens ?? 0;
    usage.cacheWriteTokens += u.cacheWriteTokens ?? 0;

    if (calls.length === 0) {
      session.nudge("Call submit_build with the finished build, a summary and a reason for each choice.");
      continue;
    }

    const results: ToolResult[] = [];
    for (const call of calls) {
      if (call.name === "submit_build") {
        const input = asBuild(call.input) ?? {};
        const build = asBuild(input.build);
        const reasons = parseReasons(input.reasons);
        const summary = typeof input.summary === "string" ? input.summary.trim() : undefined;
        if (!build) {
          results.push({ call, isError: true, content: "submit_build needs a build object." });
          continue;
        }
        const check = checkBuild(build, content, campaign);
        last = { build, check, summary, reasons };
        const problems = reasonProblems(build, reasons);
        if (check.accepted && problems.length === 0) return done("accepted", turn);
        results.push({ call, isError: true, content: JSON.stringify({ rejected: true, reasonProblems: problems, ...check }) });
        continue;
      }
      try {
        const out = runTool(call.name, call.input, content, campaign);
        if (call.name === "validate_build") {
          const build = asBuild(asBuild(call.input)?.build);
          if (build) last = { build, check: out as BuildCheck, summary: last?.summary, reasons: last?.reasons ?? [] };
        }
        results.push({ call, content: JSON.stringify(out) });
      } catch (err) {
        if (!(err instanceof ToolError)) throw err;
        results.push({ call, isError: true, content: err.message });
      }
    }
    session.addResults(results);
  }

  return done("turn-limit", maxTurns);
}
