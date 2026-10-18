// The loop against a scripted fake of the Messages API. Nothing here calls
// the real API.
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { BuildInput } from "../engine/build.js";
import { loadContent } from "../engine/content.js";
import { DescribeFailure, describeCharacter, MODEL, type CreateMessage } from "./loop.js";
import type { Reason } from "./types.js";

const { content } = loadContent();

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
type Block = Anthropic.Beta.BetaContentBlock;

let ids = 0;
const toolUse = (name: string, input: unknown): Block => ({ type: "tool_use", id: `toolu_${++ids}`, name, input }) as Block;

function message(content: Block[], stop: Anthropic.Beta.BetaMessage["stop_reason"] = "tool_use"): Anthropic.Beta.BetaMessage {
  return {
    id: `msg_${++ids}`,
    type: "message",
    role: "assistant",
    model: MODEL,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Beta.BetaMessage;
}

// Returns the scripted responses in order and records every request.
function script(...responses: Anthropic.Beta.BetaMessage[]) {
  const calls: Params[] = [];
  const create = vi.fn<CreateMessage>(async (params) => {
    calls.push(structuredClone(params));
    const next = responses.shift();
    if (!next) throw new Error("the script ran out of responses");
    return next;
  });
  return { create, calls };
}

const goblinoid: BuildInput = {
  name: "Pell",
  kind: "tatot",
  form: "goblinoid",
  origin: "tetra",
  profession: "licensed-mage",
  past: "raised-in-the-caravan-town",
  level: 1,
  levels: [{ group: "mental", points: { logic: 1, memory: 2 } }],
  traits: [
    { trait: "tinkerer", rank: 1, pick: "universal" },
    { trait: "herbalism", rank: 1, pick: "universal" },
  ],
  choices: [],
};

const reasonsFor = (b: BuildInput): Reason[] => [
  ...["kind", "form", "origin", "profession", "past", "levels"].map((target) => ({ target, reason: `fits: ${target}` })),
  ...(b.traits ?? []).map((t) => ({ target: t.trait, reason: `fits: ${t.trait}` })),
];

const submit = (build: unknown, reasons: Reason[] = reasonsFor(build as BuildInput)) =>
  toolUse("submit_build", { build, summary: "A goblinoid mage from the caravan town.", reasons });

const resultsOf = (p: Params) => {
  const last = p.messages[p.messages.length - 1]!;
  return last.content as Anthropic.Beta.BetaToolResultBlockParam[];
};

describe("describeCharacter", () => {
  it("retrieves, validates and returns an accepted build with reasons", async () => {
    const { create, calls } = script(
      message([
        { type: "thinking", thinking: "", signature: "sig" } as Block,
        toolUse("get_kind", { id: "tatot" }),
        toolUse("search_traits", { query: "magic" }),
      ]),
      message([toolUse("validate_build", { build: goblinoid })]),
      message([submit(goblinoid)]),
    );
    const result = await describeCharacter({ description: "A small goblin who studied magic at Tetra.", content, create });

    expect(result.status).toBe("accepted");
    expect(result.build).toEqual(goblinoid);
    expect(result.check?.legal).toBe(true);
    expect(result.reasons).toHaveLength(8);
    expect(result.turns).toBe(3);
    expect(result.usage).toEqual({ inputTokens: 300, outputTokens: 150, cacheReadTokens: 9000, cacheWriteTokens: 0 });

    // The cached prefix: tools, then the instructions and the content index.
    const first = calls[0]!;
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.tools?.map((t) => ("name" in t ? t.name : ""))).toContain("validate_build");
    const system = first.system as Anthropic.Beta.BetaTextBlockParam[];
    expect(system.at(-1)!.cache_control).toEqual({ type: "ephemeral" });
    expect(system.at(-1)!.text).toContain("- licensed-mage:");
    expect(first.messages[0]!.content).toContain("A small goblin who studied magic at Tetra.");
    // The prefix is identical on every turn, so it stays cached.
    expect(calls[2]!.system).toEqual(first.system);
    expect(calls[2]!.tools).toEqual(first.tools);

    // Tool results go back with the matching ids, and the thinking block is replayed unchanged.
    const second = calls[1]!;
    expect(second.messages[1]!.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "thinking", signature: "sig" })]));
    const results = resultsOf(second);
    expect(results.map((r) => r.is_error)).toEqual([undefined, undefined]);
    expect(JSON.parse(results[0]!.content as string).forms).toHaveLength(2);
  });

  it("sends engine errors back and accepts the repaired build", async () => {
    const broken = { ...goblinoid, levels: [{ group: "mental", points: { logic: 5 } }] };
    const { create, calls } = script(message([submit(broken)]), message([submit(goblinoid)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, create });

    expect(result.status).toBe("accepted");
    expect(result.build).toEqual(goblinoid);
    expect(result.turns).toBe(2);
    const [rejection] = resultsOf(calls[1]!);
    expect(rejection!.is_error).toBe(true);
    const body = JSON.parse(rejection!.content as string);
    expect(body.rejected).toBe(true);
    expect(body.errors.map((e: { code: string }) => e.code)).toContain("allocation");
  });

  it("rejects unknown ids in code, even when the engine would only warn", async () => {
    // The engine only warns about answers to pools with no Traits in them.
    const invented = {
      ...goblinoid,
      profession: "caravaneer",
      choices: [{ package: "caravaneer", from: "contact", traits: ["harbor-master-oyl"] }],
    };
    const unknownTrait = { ...goblinoid, traits: [{ trait: "fireball", rank: 1, pick: "universal" }] };
    const fixed = { ...goblinoid, profession: "caravaneer" };
    const { create, calls } = script(
      message([submit(invented)]),
      message([toolUse("validate_build", { build: unknownTrait })]),
      message([submit(fixed)]),
    );
    const result = await describeCharacter({ description: "A goblin caravan driver.", content, create });

    const first = JSON.parse(resultsOf(calls[1]!)[0]!.content as string);
    expect(first.unknownIds).toEqual([expect.objectContaining({ path: "choices[0]" })]);
    const second = JSON.parse(resultsOf(calls[2]!)[0]!.content as string);
    expect(second.accepted).toBe(false);
    expect(second.unknownIds).toEqual([{ path: "traits[0]", message: 'Trait "fireball" doesn\'t exist' }]);

    // Accepted with the Contact left for the player.
    expect(result.status).toBe("accepted");
    expect(result.check?.openChoices).toEqual([expect.objectContaining({ package: "caravaneer", from: "contact" })]);
    expect(result.check?.legal).toBe(false);
  });

  it("asks for a reason for every choice", async () => {
    const { create, calls } = script(message([submit(goblinoid, reasonsFor(goblinoid).slice(1))]), message([submit(goblinoid)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, create });
    expect(result.status).toBe("accepted");
    const body = JSON.parse(resultsOf(calls[1]!)[0]!.content as string);
    expect(body.reasonProblems).toEqual(["Add a reason for: kind."]);
  });

  it("stops at the turn limit and returns the last proposal", async () => {
    const broken = { ...goblinoid, past: "noble-household", levels: [] };
    const { create } = script(
      message([submit(broken)]),
      message([toolUse("validate_build", { build: broken })]),
      message([toolUse("search_traits", { query: "magic" })]),
    );
    const result = await describeCharacter({ description: "A goblin mage.", content, create, maxTurns: 3 });

    expect(create).toHaveBeenCalledTimes(3);
    expect(result.status).toBe("turn-limit");
    expect(result.build).toEqual(broken);
    expect(result.check?.accepted).toBe(false);
    expect(result.check?.errors.length).toBeGreaterThan(0);
  });

  it("nudges Claude to submit when it answers without a tool", async () => {
    const { create, calls } = script(message([{ type: "text", text: "Here's my idea…", citations: null } as Block], "end_turn"), message([submit(goblinoid)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, create });
    expect(result.status).toBe("accepted");
    expect(calls[1]!.messages.at(-1)!.content).toContain("submit_build");
  });

  it("returns tool errors to Claude instead of failing", async () => {
    const { create, calls } = script(message([toolUse("get_package", { id: "pirate-king" })]), message([submit(goblinoid)]));
    await describeCharacter({ description: "A goblin mage.", content, create });
    expect(resultsOf(calls[1]!)[0]).toEqual(expect.objectContaining({ is_error: true }));
  });

  it("fails clearly on a refusal", async () => {
    const { create } = script(message([], "refusal"));
    await expect(describeCharacter({ description: "x", content, create })).rejects.toBeInstanceOf(DescribeFailure);
  });
});
