// The loop through the Claude adapter, against a scripted fake of the
// Messages API. Nothing here calls the real API.
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { loadContent } from "../engine/content.js";
import type { ConceptInput } from "../engine/solve.js";
import { anthropicProvider, CLAUDE_MODEL as MODEL, type CreateMessage } from "./anthropic.js";
import { describeCharacter, looksLine } from "./loop.js";
import { DescribeFailure } from "./model.js";
import type { Reason } from "./types.js";
import type { Provider } from "./model.js";

// Most tests are about other parts of the loop, so they skip the Claude review turn.
const noReview = (p: Provider): Provider => ({ ...p, review: false });

// The level 1 fixture builds can't reach Skills' minimum stats (or Shield
// Wall's, once a Skill); validate.test.ts checks those.
const loaded = loadContent().content;
const content = {
  ...loaded,
  traits: loaded.traits.map((t) => (t.category === "skill" || t.id === "shield-wall" ? { ...t, minStats: {} } : t)),
};
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
  items: ["quarterstaff", "potion-kit", "writing-kit"],
};

// Known ids, but a profession in the past slot: the engine sends it back.
const misslotted: ConceptInput = { ...goblinoid, past: "licensed-mage" };

const reasonsFor = (c: ConceptInput): Reason[] =>
  ["kind", "origin", "profession", "past", "levels", ...(c.traits ?? []), ...(c.items ?? []).map((i) => `item:${typeof i === "string" ? i : i.item}`)].map((target) => ({ target, reason: `fits: ${target}` }));

const submit = (concept: unknown, reasons: Reason[] = reasonsFor(concept as ConceptInput)) =>
  toolUse("submit_build", { concept, summary: "A goblinoid mage from the caravan town.", reasons });

const resultsOf = (p: Params) => {
  const last = p.messages[p.messages.length - 1]!;
  return last.content as Anthropic.Beta.BetaToolResultBlockParam[];
};

const bodyOf = (p: Params) => JSON.parse(resultsOf(p)[0]!.content as string);

describe("describeCharacter", () => {
  it("asks once, by name, for the reasons a legal build is missing", async () => {
    const { create, calls } = script(message([submit(goblinoid, [])]), message([submit(goblinoid, [])]), message([submit(goblinoid)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1 });
    expect(bodyOf(calls[1]!).review).toBeDefined();
    expect(bodyOf(calls[2]!).reasonsNeeded).toMatch(/^The build is legal, but these choices have no reason yet: kind, origin, profession, past, levels/);
    expect(result.status).toBe("accepted");
    expect(result.turns).toBe(3);
    expect(result.reasons.find((r) => r.target === "kind")?.reason).toBe("fits: kind");
  });

  it("reviews a legal Claude build once, and keeps earlier reasons the final submit skips", async () => {
    const reasons = reasonsFor(goblinoid);
    const trimmed = { ...goblinoid, traits: (goblinoid.traits ?? []).slice(0, 2) };
    const { create, calls } = script(message([submit(goblinoid, reasons)]), message([submit(trimmed, [{ target: "kind", reason: "small and clever" }])]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1 });
    expect(bodyOf(calls[1]!).review).toMatch(/^The engine built a legal character\. Before it's final, check it against the player's description/);
    expect(result.status).toBe("accepted");
    expect(result.turns).toBe(2);
    // The final submit's reason replaces the earlier one; the rest carry over.
    expect(result.reasons.find((r) => r.target === "kind")?.reason).toBe("small and clever");
    expect(result.reasons.find((r) => r.target === "origin")?.reason).toBe("fits: origin");
  });

  it("keeps the name from an earlier submit when the final one drops it", async () => {
    const { name: _, ...unnamed } = goblinoid;
    const { create } = script(message([submit(goblinoid)]), message([submit(unnamed)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: anthropicProvider(create), campaign: L1 });
    expect(result.status).toBe("accepted");
    expect(result.build?.name).toBe("Pell");
  });

  it("names the character as the player did, whatever the model submits", async () => {
    const { create } = script(message([submit(goblinoid)]), message([submit({ ...goblinoid, name: "Someone Else" })]));
    const result = await describeCharacter({ description: "A goblin mage.", name: "Tibb", content, provider: anthropicProvider(create), campaign: L1 });
    expect(result.build?.name).toBe("Tibb");
  });

  it("tells the model the player's age and gender as cosmetic details, and nothing when neither is set", () => {
    expect(looksLine({ age: 34, gender: "Female" })).toMatch(/age 34 and gender Female\. These are cosmetic\..*don't let them decide/);
    expect(looksLine({ gender: "Fluid" })).toContain("character's gender Fluid.");
    expect(looksLine({ gender: " " })).toBe("");
    expect(looksLine({})).toBe("");
  });

  it("lists height and weight with the other looks", () => {
    expect(looksLine({ age: 34, gender: "Female", height: "1.7 m", weight: "60 kg" })).toContain(
      "character's age 34, gender Female, height 1.7 m and weight 60 kg.",
    );
    expect(looksLine({ weight: " 300 lb " })).toContain("character's weight 300 lb.");
  });

  it("builds with another Claude model when told to, without a refusal fallback for Haiku", async () => {
    const opus = script(message([submit(goblinoid)]));
    await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(opus.create)), campaign: L1 });
    expect(opus.calls[0]).toEqual(expect.objectContaining({ model: "claude-opus-5-5", fallbacks: "default" }));

    const haiku = script(message([submit(goblinoid)]));
    await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(haiku.create, 12, "claude-haiku-5-5")), campaign: L1 });
    expect(haiku.calls[0]!.model).toBe("claude-haiku-5-5");
    expect(haiku.calls[0]).not.toHaveProperty("fallbacks");
    expect(haiku.calls[0]).not.toHaveProperty("betas");
  });

  it("builds the submitted concept and returns an accepted build with reasons", async () => {
    const { create, calls } = script(
      message([{ type: "thinking", thinking: "", signature: "sig" } as Block, toolUse("get_kind", { id: "tatot-goblinoid" })]),
      message([submit(goblinoid)]),
    );
    const result = await describeCharacter({ description: "A small goblin who studied magic at Tetra.", content, provider: noReview(anthropicProvider(create)), campaign: L1 });

    expect(result.status).toBe("accepted");
    expect(result.turns).toBe(2);
    expect(result.check?.legal).toBe(true);
    expect(result.build).toEqual(expect.objectContaining({ kind: "tatot-goblinoid", name: "Pell", level: 1 }));
    expect(result.build!.levels).toEqual([{ group: "mental", points: { logic: 2, memory: 1 } }]);
    // Reasons are kept for what the build holds, and dropped for Traits it didn't take.
    const picked = new Set(result.build!.traits!.map((t) => t.trait));
    const fixed = ["kind", "origin", "profession", "past", "levels"];
    const carried = new Set(result.build!.items!.map((i) => `item:${i.item}`));
    for (const r of result.reasons) expect(fixed.includes(r.target) || picked.has(r.target) || carried.has(r.target)).toBe(true);
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
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(create)), campaign: L1 });

    expect(result.status).toBe("accepted");
    expect(result.turns).toBe(2);
    expect(resultsOf(calls[1]!)[0]!.is_error).toBe(true);
    const body = bodyOf(calls[1]!);
    expect(body.rejected).toBe(true);
    expect(body.errors.map((e: { code: string }) => e.code)).toContain("package");
  });

  it("rejects unknown packages in code, and skips unknown Traits", async () => {
    const invented = { ...goblinoid, profession: "pirate-king" };
    const fixed = { ...goblinoid, traits: ["moonbeam", ...goblinoid.traits!] };
    const { create, calls } = script(message([submit(invented)]), message([submit(fixed)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(create)), campaign: L1 });

    expect(bodyOf(calls[1]!).unknownIds).toEqual([expect.objectContaining({ path: "profession" })]);
    expect(result.status).toBe("accepted");
    expect(result.build!.traits!.map((t) => t.trait)).not.toContain("moonbeam");
  });

  it("sends a legal build back once when the Trait list runs out", async () => {
    const thin = { ...goblinoid, traits: ["tinkerer", "moonbeam"] };
    const { create, calls } = script(message([submit(thin)]), message([submit(thin)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(create)), campaign: L1 });
    const body = bodyOf(calls[1]!);
    expect(body.picks).toMatch(/^The engine built a legal character, but \d+ of \d+ universal picks are unspent: the Trait list ran out\./);
    expect(body.taken).toEqual(["tinkerer"]);
    expect(body.skipped).toEqual([{ trait: "moonbeam", reason: `Trait "moonbeam" doesn't exist` }]);
    // Only once: the second submit is accepted as it is.
    expect(result.status).toBe("accepted");
    expect(result.turns).toBe(2);
  });

  it("asks once for items when a legal build carries nothing", async () => {
    const bare = { ...goblinoid, items: [] };
    const { create, calls } = script(message([submit(bare)]), message([submit(goblinoid)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(create)), campaign: L1 });
    expect(bodyOf(calls[1]!).items).toMatch(/^The engine built a legal character, but it carries nothing\./);
    expect(result.status).toBe("accepted");
    expect(result.build?.items?.map((i) => i.item)).toEqual(["quarterstaff", "potion-kit", "writing-kit"]);
    expect(result.reasons.find((r) => r.target === "item:potion-kit")?.reason).toBe("fits: item:potion-kit");
  });

  it("reports progress in plain words", async () => {
    const { create } = script(
      message([toolUse("get_kind", { id: "tatot-goblinoid" }), toolUse("search_traits", { query: "magic" })]),
      message([submit(misslotted)]),
      message([submit(goblinoid)]),
    );
    const progress: string[] = [];
    await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(create)), campaign: L1, onProgress: (p) => progress.push(`${p.turn} ${p.status}`) });
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
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(create)), campaign: L1, maxTurns: 1 });
    expect(result.status).toBe("accepted");
    expect(result.check?.legal).toBe(true);
  });

  it("stops at the turn limit and returns the last proposal", async () => {
    const { create } = script(message([submit({ ...goblinoid, kind: "dragon" })]), message([toolUse("search_traits", { query: "magic" })]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(create)), campaign: L1, maxTurns: 2 });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("turn-limit");
    expect(result.build?.kind).toBe("dragon");
    expect(result.check?.accepted).toBe(false);
  });

  it("explains a concept that doesn't match the format", async () => {
    const { create, calls } = script(message([submit({ kind: "tatot-goblinoid" })]), message([submit(goblinoid)]));
    await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(create)), campaign: L1 });
    expect(resultsOf(calls[1]!)[0]!.content).toMatch(/^The concept doesn't match the format: .*origin/);
  });

  it("nudges the model to submit when it answers without a tool", async () => {
    const { create, calls } = script(message([{ type: "text", text: "Here's my idea…", citations: null } as Block], "end_turn"), message([submit(goblinoid)]));
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(create)), campaign: L1 });
    expect(result.status).toBe("accepted");
    expect(calls[1]!.messages.at(-1)!.content).toContain("submit_build");
  });

  it("returns tool errors to the model instead of failing", async () => {
    const { create, calls } = script(message([toolUse("get_package", { id: "pirate-king" })]), message([submit(goblinoid)]));
    await describeCharacter({ description: "A goblin mage.", content, provider: noReview(anthropicProvider(create)), campaign: L1 });
    expect(resultsOf(calls[1]!)[0]).toEqual(expect.objectContaining({ is_error: true }));
  });

  it("fails clearly on a refusal", async () => {
    const { create } = script(message([], "refusal"));
    await expect(describeCharacter({ description: "x", content, provider: noReview(anthropicProvider(create)), campaign: L1 })).rejects.toBeInstanceOf(DescribeFailure);
  });
});
