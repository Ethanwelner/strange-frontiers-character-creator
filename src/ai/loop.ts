// The describe → build → repair loop. The model submits a character concept;
// the solver turns it into a full build and the engine checks it in the same
// step. The loop ends when a build is accepted or the turn limit is reached. Which model runs
// it is up to the Provider (anthropic.ts, ollama.ts).
import type { BuildInput, Campaign } from "../engine/build.js";
import { DEFAULT_CAMPAIGN } from "../engine/build.js";
import type { Content } from "../engine/parse.js";
import { solveConcept, type SkippedTrait } from "../engine/solve.js";
import type { Provider, ToolResult } from "./model.js";
import { contentIndex, INSTRUCTIONS } from "./prompt.js";
import { checkBuild, runTool, ToolError } from "./tools.js";
import type { BuildCheck, DescribeResult, Progress, Reason, Usage } from "./types.js";

export interface DescribeOptions {
  description: string;
  content: Content;
  provider: Provider;
  campaign?: Campaign;
  maxTurns?: number;
  // Called with each turn's tool calls, for tracing (npm run eval -- --trace).
  onTurn?: (turn: number, calls: { name: string; input: unknown }[]) => void;
  // A live status line for the UI.
  onProgress?: (progress: Progress) => void;
}

// What a tool call is doing, in a few words for the status line.
function describeCall(name: string, input: unknown, content: Content): string {
  const i = asBuild(input) ?? {};
  const id = typeof i.id === "string" ? i.id : "";
  switch (name) {
    case "get_kind":
      return `Looking up the ${content.kinds.find((k) => k.id === id)?.name ?? id} Kind`;
    case "get_package":
      return `Reading ${content.packages.find((p) => p.id === id)?.name ?? id}`;
    case "list_packages":
      return `Listing ${String(i.type ?? "package")}s`;
    case "search_traits":
      return typeof i.query === "string" && i.query.trim() ? `Searching Traits for "${i.query.trim()}"` : "Searching Traits";
    case "submit_build":
      return "Submitting the build";
    default:
      return name;
  }
}

// The tail of the model's reasoning, flattened to one line.
const thinkingTail = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `…${flat.slice(-160)}` : flat;
};

// The reason targets a build needs: one per choice it makes.
function reasonTargets(build: Record<string, unknown>): Set<string> {
  const targets = new Set<string>();
  for (const key of ["kind", "origin", "profession", "past"]) if (typeof build[key] === "string") targets.add(key);
  targets.add("levels");
  for (const p of Array.isArray(build.traits) ? build.traits : []) if (typeof p?.trait === "string") targets.add(p.trait);
  for (const a of Array.isArray(build.choices) ? build.choices : []) targets.add(`choice:${a?.package ?? a?.trait}/${a?.from}`);
  return targets;
}

// "6 of 9 universal picks are unspent" when more than two picks the build
// could spend are banked. Background picks only count when the Background
// Trait list has something on it.
function unspentPicks(check: BuildCheck): string | undefined {
  const picks = check.summary?.picks;
  if (!picks) return undefined;
  const parts: string[] = [];
  let total = picks.universal.banked;
  if (picks.universal.banked) parts.push(`${picks.universal.banked} of ${picks.universal.available} universal picks`);
  if (picks.background.banked && check.summary!.backgroundList.length) {
    total += picks.background.banked;
    parts.push(`${picks.background.banked} of ${picks.background.available} background picks`);
  }
  return total > 2 ? `${parts.join(" and ")} are unspent` : undefined;
}

// Reasons that point at something in the build, for a build accepted with gaps.
const keepMatching = (build: Record<string, unknown>, reasons: Reason[]) => {
  const targets = reasonTargets(build);
  return reasons.filter((r) => targets.has(r.target));
};

function parseReasons(v: unknown): Reason[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r) => typeof r?.target === "string" && typeof r?.reason === "string")
    .map((r) => ({ target: r.target as string, reason: (r.reason as string).trim() }));
}

// Skipped Traits for the model, without the "no picks left" tail.
const compactSkipped = (skipped: SkippedTrait[]) => skipped.filter((s) => s.reason !== "no picks left");

const asBuild = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

export async function describeCharacter(opts: DescribeOptions): Promise<DescribeResult> {
  const { content, provider } = opts;
  const campaign = opts.campaign ?? DEFAULT_CAMPAIGN;
  const maxTurns = opts.maxTurns ?? provider.maxTurns;
  let turnNow = 0;
  const progress = (status: string) => opts.onProgress?.({ turn: turnNow, maxTurns, status });
  // Reasoning streams token by token; the status line only needs a few updates a second.
  let lastThought = 0;
  const onThinking = opts.onProgress
    ? (text: string) => {
        const now = Date.now();
        if (now - lastThought < 400) return;
        lastThought = now;
        progress(`Thinking: ${thinkingTail(text)}`);
      }
    : undefined;
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
  // Unspent picks get one push back: a legal build isn't thrown away over them.
  let picksPushUsed = false;
  // Reasoning helps with the concept; fixing what the engine sends back
  // doesn't need it, so models that can skip it stop after the first submit.
  let submitted = false;
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
    turnNow = turn;
    progress("Thinking");
    const { calls, usage: u } = await session.send(onThinking, { think: !submitted });
    opts.onTurn?.(turn, calls);
    if (calls.length) progress(calls.map((c) => describeCall(c.name, c.input, content)).join(" · "));
    usage.inputTokens += u.inputTokens ?? 0;
    usage.outputTokens += u.outputTokens ?? 0;
    usage.cacheReadTokens += u.cacheReadTokens ?? 0;
    usage.cacheWriteTokens += u.cacheWriteTokens ?? 0;

    if (calls.length === 0) {
      session.nudge("Call submit_build with the concept, a summary and a reason for each choice.");
      continue;
    }

    const results: ToolResult[] = [];
    for (const call of calls) {
      if (call.name === "submit_build") {
        const input = asBuild(call.input) ?? {};
        const concept = asBuild(input.concept);
        const reasons = parseReasons(input.reasons);
        const summary = typeof input.summary === "string" ? input.summary.trim() : undefined;
        if (!concept) {
          results.push({ call, isError: true, content: "submit_build needs a concept object." });
          continue;
        }
        submitted = true;
        const solved = solveConcept(concept, content, campaign);
        if ("error" in solved) {
          results.push({ call, isError: true, content: `The concept doesn't match the format: ${solved.error}` });
          continue;
        }
        const check = checkBuild(solved.build, content, campaign);
        last = { build: solved.build, check, summary, reasons };
        const report = { taken: solved.taken, skipped: compactSkipped(solved.skipped) };
        const unspent = check.accepted ? unspentPicks(check) : undefined;
        if (unspent && !picksPushUsed) {
          progress("Build is legal; asking for more Traits");
          picksPushUsed = true;
          const picks = `The engine built a legal character, but ${unspent}: the Trait list ran out. Submit again with the same concept and more Traits that fit added to the list.`;
          results.push({ call, isError: true, content: JSON.stringify({ rejected: true, picks, ...report }) });
          continue;
        }
        if (check.accepted) {
          last.reasons = keepMatching(solved.build, reasons);
          progress("Done");
          return done("accepted", turn);
        }
        progress(`The engine sent the concept back with ${check.errors.length + check.unknownIds.length} problems; fixing them`);
        results.push({ call, isError: true, content: JSON.stringify({ rejected: true, unknownIds: check.unknownIds, errors: check.errors, ...report }) });
        continue;
      }
      try {
        const out = runTool(call.name, call.input, content, campaign);
        results.push({ call, content: JSON.stringify(out) });
      } catch (err) {
        if (!(err instanceof ToolError)) throw err;
        results.push({ call, isError: true, content: err.message });
      }
    }
    session.addResults(results);
  }

  // Out of turns: a legal last build still counts, whatever its reasons.
  if (last?.check.accepted) {
    last.reasons = keepMatching(last.build, last.reasons);
    return done("accepted", maxTurns);
  }
  return done("turn-limit", maxTurns);
}
