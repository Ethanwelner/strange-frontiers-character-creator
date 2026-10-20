// The loop through the Claude adapter, against a scripted fake of the
// Messages API. Nothing here calls the real API.
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { loadContent } from "../engine/content.js";
import type { ConceptInput } from "../engine/solve.js";
import { anthropicProvider, CLAUDE_MODEL as MODEL, type CreateMessage } from "./anthropic.js";
import { describeCharacter } from "./loop.js";
import { DescribeFailure } from "./model.js";
import type { Reason } from "./types.js";

const { content } = loadContent();
// These fixtures are level 1 characters; the default campaign starts at 3.
const L1 = { startingLevel: 1 };

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

const goblinoid: ConceptInput = {
  name: "Pell",
  kind: "tatot-goblinoid",
  origin: "dreft",
  profession: "licensed-mage",
  past: "raised-in-the-caravan-town",
  focus: ["logic", "memory"],
  traits: [
    "tinkerer", "herbalism", "appraisal", "smooth-talker", "vigilance", "tracker", "survivalist",
    "ambusher", "haggler", "streetwise", "sleight-of-hand", "teamster", "relic-handling", "schemer",
  ],
};

// Known ids, but a profession in the past slot: the engine sends it back.
const misslotted: ConceptInput = { ...goblinoid, past: "licensed-mage" };

const reasonsFor = (c: ConceptInput): Reason[] =>
  ["kind", "origin", "profession", "past", "levels", ...(c.traits ?? [])].map((target) => ({ target, reason: `fits: ${target}` }));

const submit = (concept: unknown, reasons: Reason[] = reasonsFor(concept as ConceptInput)) =>
  toolUse("submit_build", { concept, summary: "A goblinoid mage from the caravan town.", reasons });

const resultsOf = (p: Params) => {
  const last = p.messages[p.messages.length - 1]!;
  return last.content as Anthropic.Beta.BetaToolResultBlockParam[];
};

const bodyOf = (p: Params) => JSON.parse(resultsOf(p)[0]!.content as string);

describe("describeCharacter", () => {
  it("builds the submitted concept and returns an accepted build with reasons", async () => {
    const { create, calls } = script(
      message([{ type: "thinking", thinking: "", signature: "sig" } as Block, toolUse("get_kind", { id: "tatot-goblinoid" })]),
      message([submit(goblinoid)]),
    );
    const result = await describeCharacter({ description: "A small goblin who studied magic at Tetra.", content, provider: anthropicProvider(create), campaign: L1 });

    expect(result.status).toBe("accepted");
    expect(result.turns).toBe(2);
    expect(result.check?.legal).toBe(true);
    expect(result.build).toEqual(expect.objectContaining({ kind: "tatot-goblinoid", name: "Pell", level: 1 }));
    expect(result.build!.levels).toEqual([{ group: "mental", points: { logic: 2, memory: 1 } }]);
    // Reasons are kept for what the build holds, and dropped for Traits it didn't take.
    const picked = new Set(result.build!.traits!.map((t) => t.trait));
    const fixed = ["kind", "origin", "profession", "past", "levels"];
    for (const r of result.reasons) expect(fixed.includes(r.target) || picked.has(r.target)).toBe(true);
    expect(result.reasons.map((r) => r.target)).toEqual(expect.arrayContaining(fixed));
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100, cacheReadTokens: 6000, cacheWriteTokens: 0 });

    // The cached prefix: tools, then the instructions and the content index.
    const first = calls[0]!;
    expect(first.model).toBe("claude-opus-5-5");
    const names = first.tools?.map((t) => ("name" in t ? t.name : ""));
    expect(names).toContain("submit_build");
    expect(names).not.toContain("validate_build");
    const system = first.system as Anthropic.Beta.BetaTextBlockParam[];
    expect(system.at(-1)!.cache_control).toEqual({ type: "ephemeral" });
    expect(system.at(-1)!.text).toContain("- licensed-mage:");
    expect(first.messages[0]!.content).toContain("A small goblin who studied magic at Tetra.");
    // The prefix is identical on every turn, so it stays cached.
    expect(calls[1]!.system).toEqual(first.system);
    expect(calls[1]!.tools).toEqual(first.tools);

    // Tool results go back with the matching ids, and the thinking block is replayed unchanged.
    const second = calls[1]!;
    expect(second.messages[1]!.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "thinking", signature: "sig" })]));
    expect(bodyOf(second).id).toBe("tatot-goblinoid");
  });

  it("sends engine errors back and accepts the repaired concept", async () => {
    const { create, calls } = script(message([submit(misslotted)]), message([submit(goblinoid)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1 });

    expect(result.status).toBe("accepted");
    expect(result.turns).toBe(2);
    expect(resultsOf(calls[1]!)[0]!.is_error).toBe(true);
    const body = bodyOf(calls[1]!);
    expect(body.rejected).toBe(true);
    expect(body.errors.map((e: { code: string }) => e.code)).toContain("package");
  });

  it("rejects unknown packages in code, and skips unknown Traits", async () => {
    const invented = { ...goblinoid, profession: "pirate-king" };
    const fixed = { ...goblinoid, traits: ["fireball", ...goblinoid.traits!] };
    const { create, calls } = script(message([submit(invented)]), message([submit(fixed)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1 });

    expect(bodyOf(calls[1]!).unknownIds).toEqual([expect.objectContaining({ path: "profession" })]);
    expect(result.status).toBe("accepted");
    expect(result.build!.traits!.map((t) => t.trait)).not.toContain("fireball");
  });

  it("sends a legal build back once when the Trait list runs out", async () => {
    const thin = { ...goblinoid, traits: ["tinkerer", "fireball"] };
    const { create, calls } = script(message([submit(thin)]), message([submit(thin)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1 });
    const body = bodyOf(calls[1]!);
    expect(body.picks).toMatch(/^The engine built a legal character, but \d+ of \d+ universal picks are unspent: the Trait list ran out\./);
    expect(body.taken).toEqual(["tinkerer"]);
    expect(body.skipped).toEqual([{ trait: "fireball", reason: `Trait "fireball" doesn't exist` }]);
    // Only once: the second submit is accepted as it is.
    expect(result.status).toBe("accepted");
    expect(result.turns).toBe(2);
  });

  it("reports progress in plain words", async () => {
    const { create } = script(
      message([toolUse("get_kind", { id: "tatot-goblinoid" }), toolUse("search_traits", { query: "magic" })]),
      message([submit(misslotted)]),
      message([submit(goblinoid)]),
    );
    const progress: string[] = [];
    await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1, onProgress: (p) => progress.push(`${p.turn} ${p.status}`) });
    expect(progress).toEqual([
      "1 Thinking",
      '1 Looking up the Tatot, Goblinoid Kind · Searching Traits for "magic"',
      "2 Thinking",
      "2 Submitting the build",
      "2 The engine sent the concept back with 1 problems; fixing them",
      "3 Thinking",
      "3 Submitting the build",
      "3 Done",
    ]);
  });

  it("keeps a legal build when the turn limit hits before it's accepted", async () => {
    const { create } = script(message([submit({ ...goblinoid, traits: [] })]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1, maxTurns: 1 });
    expect(result.status).toBe("accepted");
    expect(result.check?.legal).toBe(true);
  });

  it("stops at the turn limit and returns the last proposal", async () => {
    const { create } = script(message([submit({ ...goblinoid, kind: "dragon" })]), message([toolUse("search_traits", { query: "magic" })]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1, maxTurns: 2 });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("turn-limit");
    expect(result.build?.kind).toBe("dragon");
    expect(result.check?.accepted).toBe(false);
  });

  it("explains a concept that doesn't match the format", async () => {
    const { create, calls } = script(message([submit({ kind: "tatot-goblinoid" })]), message([submit(goblinoid)]));
    await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1 });
    expect(resultsOf(calls[1]!)[0]!.content).toMatch(/^The concept doesn't match the format: .*origin/);
  });

  it("nudges the model to submit when it answers without a tool", async () => {
    const { create, calls } = script(message([{ type: "text", text: "Here's my idea…", citations: null } as Block], "end_turn"), message([submit(goblinoid)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1 });
    expect(result.status).toBe("accepted");
    expect(calls[1]!.messages.at(-1)!.content).toContain("submit_build");
  });

  it("returns tool errors to the model instead of failing", async () => {
    const { create, calls } = script(message([toolUse("get_package", { id: "pirate-king" })]), message([submit(goblinoid)]));
    await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1 });
    expect(resultsOf(calls[1]!)[0]).toEqual(expect.objectContaining({ is_error: true }));
  });

  it("fails clearly on a refusal", async () => {
    const { create } = script(message([], "refusal"));
    await expect(describeCharacter({ description: "x", content, provider: anthropicProvider(create), campaign: L1 })).rejects.toBeInstanceOf(DescribeFailure);
  });
});
