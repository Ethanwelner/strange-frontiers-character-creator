// The describe → build → validate → repair loop. Claude proposes builds
// through tools; the engine checks every one, and the loop ends when a
// submitted build is accepted or the turn limit is reached.
import type Anthropic from "@anthropic-ai/sdk";
import type { BuildInput, Campaign } from "../engine/build.js";
import { DEFAULT_CAMPAIGN } from "../engine/build.js";
import type { Content } from "../engine/parse.js";
import { contentIndex, INSTRUCTIONS } from "./prompt.js";
import { checkBuild, runTool, ToolError, TOOLS } from "./tools.js";
import type { BuildCheck, DescribeResult, Reason, Usage } from "./types.js";

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.BetaMessage;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

// The one call the loop makes. The server passes the SDK's
// client.beta.messages.create; tests pass a fake.
export type CreateMessage = (params: Params) => Promise<Message>;

export const MODEL = "claude-opus-5-5";
export const MAX_TURNS = 12;
// Server-side fallback: if a safety classifier declines, the API retries on
// the model Anthropic recommends for that category.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class DescribeFailure extends Error {
  constructor(
    readonly kind: "refused" | "truncated",
    message: string,
  ) {
    super(message);
  }
}

export interface DescribeOptions {
  description: string;
  content: Content;
  create: CreateMessage;
  campaign?: Campaign;
  maxTurns?: number;
}

// The fixed part of every request: tools, then the instructions and the
// content index, with a cache breakpoint on the index.
export function requestPrefix(content: Content) {
  return {
    tools: TOOLS,
    system: [
      { type: "text" as const, text: INSTRUCTIONS },
      { type: "text" as const, text: contentIndex(content), cache_control: { type: "ephemeral" as const } },
    ],
  };
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
  const { content, create } = opts;
  const campaign = opts.campaign ?? DEFAULT_CAMPAIGN;
  const maxTurns = opts.maxTurns ?? MAX_TURNS;
  const prefix = requestPrefix(content);
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

  // The per-request values go in the first user message, after the cached prefix.
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content:
        `The campaign starts characters at level ${campaign.startingLevel}.\n\n` +
        `<player_description>\n${opts.description.trim()}\n</player_description>`,
    },
  ];

  // The most recent build Claude proposed, returned if the turn limit hits.
  let last: { build: Record<string, unknown>; check: BuildCheck; summary?: string; reasons: Reason[] } | undefined;

  for (let turn = 1; turn <= maxTurns; turn++) {
    const response = await create({
      model: MODEL,
      max_tokens: 16000,
      ...prefix,
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      // Caches the conversation so far, so each repair turn rereads it cheaply.
      cache_control: { type: "ephemeral" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      throw new DescribeFailure("refused", "Claude declined to build this character. Try describing it differently.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new DescribeFailure("truncated", "Claude's response was cut off before it finished the build.");
    }

    // Append the whole response, thinking blocks included, unchanged.
    messages.push({ role: "assistant", content: response.content });
    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (calls.length === 0) {
      messages.push({ role: "user", content: "Call submit_build with the finished build, a summary and a reason for each choice." });
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
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "submit_build needs a build object." });
          continue;
        }
        const check = checkBuild(build, content, campaign);
        last = { build, check, summary, reasons };
        const problems = reasonProblems(build, reasons);
        if (check.accepted && problems.length === 0) {
          return { status: "accepted", build: build as BuildInput, summary, reasons, check, turns: turn, usage };
        }
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: true,
          content: JSON.stringify({ rejected: true, reasonProblems: problems, ...check }),
        });
        continue;
      }
      try {
        const out = runTool(call.name, call.input, content, campaign);
        if (call.name === "validate_build") {
          const build = asBuild(asBuild(call.input)?.build);
          if (build) last = { build, check: out as BuildCheck, summary: last?.summary, reasons: last?.reasons ?? [] };
        }
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out) });
      } catch (err) {
        if (!(err instanceof ToolError)) throw err;
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: err.message });
      }
    }
    // All results for one turn go back in a single user message.
    messages.push({ role: "user", content: results });
  }

  return {
    status: "turn-limit",
    build: last?.build as BuildInput | undefined,
    summary: last?.summary,
    reasons: last?.reasons ?? [],
    check: last?.check,
    turns: maxTurns,
    usage,
  };
}
