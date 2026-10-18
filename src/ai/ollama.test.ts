// The loop through the Ollama adapter, against a scripted fake of Ollama's
// /api/chat. Nothing here needs Ollama running.
import { describe, expect, it, vi } from "vitest";
import type { BuildInput } from "../engine/build.js";
import { loadContent } from "../engine/content.js";
import { describeCharacter } from "./loop.js";
import { ollamaProvider, type Fetch } from "./ollama.js";

const { content } = loadContent();

const goblinoid: BuildInput = {
  kind: "tatot",
  form: "goblinoid",
  origin: "tetra",
  profession: "licensed-mage",
  past: "raised-in-the-caravan-town",
  level: 1,
  levels: [{ group: "mental", points: { logic: 1, memory: 2 } }],
  traits: [{ trait: "tinkerer", rank: 1, pick: "universal" }],
  choices: [],
};

const reasons = ["kind", "form", "origin", "profession", "past", "levels", "tinkerer"].map((target) => ({ target, reason: "fits" }));

const reply = (toolCalls: { name: string; arguments: unknown }[], extra: object = {}) =>
  Response.json({
    message: { role: "assistant", content: "", thinking: "hmm", tool_calls: toolCalls.map((f) => ({ function: f })) },
    done_reason: "stop",
    prompt_eval_count: 1000,
    eval_count: 200,
    ...extra,
  });

function script(...replies: Response[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetch = vi.fn<Fetch>(async (_url, init) => {
    bodies.push(JSON.parse(String(init.body)));
    const next = replies.shift();
    if (!next) throw new Error("the script ran out of replies");
    return next;
  });
  return { fetch, bodies };
}

describe("ollamaProvider, tools mode", () => {
  it("runs the loop with tool calls and returns an accepted build", async () => {
    const { fetch, bodies } = script(
      reply([{ name: "get_kind", arguments: { id: "tatot" } }]),
      // Some models send arguments as a JSON string.
      reply([{ name: "validate_build", arguments: JSON.stringify({ build: goblinoid }) }]),
      reply([{ name: "submit_build", arguments: { build: goblinoid, summary: "A goblin mage.", reasons } }]),
    );
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: ollamaProvider({ fetch, mode: "tools", host: "http://ollama.test/" }) });

    expect(result.status).toBe("accepted");
    expect(result.model).toBe("deepseek-r1:14b");
    expect(result.build).toEqual(goblinoid);
    expect(result.usage.inputTokens).toBe(3000);
    expect(fetch.mock.calls[0]![0]).toBe("http://ollama.test/api/chat");

    const first = bodies[0]!;
    expect(first.model).toBe("deepseek-r1:14b");
    expect(first.stream).toBe(false);
    const tools = first.tools as { function: { name: string } }[];
    expect(tools.map((t) => t.function.name)).toContain("search_traits");
    const messages = first.messages as { role: string; content: string }[];
    expect(messages[0]!.role).toBe("system");
    expect(messages[0]!.content).toContain("- licensed-mage:");
    expect(messages[1]!.content).toContain("A goblin mage.");

    // Tool results go back as role "tool" messages, named for their tool.
    const second = bodies[1]!.messages as { role: string; tool_name?: string; content: string }[];
    expect(second.at(-1)).toEqual(expect.objectContaining({ role: "tool", tool_name: "get_kind" }));
    expect(JSON.parse(second.at(-1)!.content).id).toBe("tatot");
  });

  it("flags tool errors in the result text", async () => {
    const { fetch, bodies } = script(
      reply([{ name: "get_package", arguments: { id: "pirate-king" } }]),
      reply([{ name: "submit_build", arguments: { build: goblinoid, summary: "A goblin mage.", reasons } }]),
    );
    await describeCharacter({ description: "A goblin mage.", content, provider: ollamaProvider({ fetch, mode: "tools" }) });
    const messages = bodies[1]!.messages as { content: string }[];
    expect(messages.at(-1)!.content).toMatch(/^Error: No package "pirate-king"/);
  });

  it("stops at its own turn limit", async () => {
    const replies = Array.from({ length: 3 }, () => reply([{ name: "search_traits", arguments: { query: "magic" } }]));
    const { fetch } = script(...replies);
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: ollamaProvider({ fetch, mode: "tools", maxTurns: 3 }) });
    expect(result.status).toBe("turn-limit");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("fails clearly when a reply is cut off", async () => {
    const { fetch } = script(reply([], { done_reason: "length" }));
    await expect(describeCharacter({ description: "x", content, provider: ollamaProvider({ fetch }) })).rejects.toThrow(/cut off/);
  });
});

const answer = (content: string) =>
  Response.json({ message: { role: "assistant", content, thinking: "hmm" }, done_reason: "stop", prompt_eval_count: 1000, eval_count: 200 });

describe("ollamaProvider, JSON mode (the default)", () => {
  it("asks for a whole build in the submit_build format and repairs from the engine's verdict", async () => {
    const broken = { ...goblinoid, levels: [{ group: "mental", points: { logic: 5 } }] };
    const { fetch, bodies } = script(
      answer(JSON.stringify({ build: broken, summary: "A goblin mage.", reasons })),
      answer("Sorry, here it is in prose."),
      answer(JSON.stringify({ build: goblinoid, summary: "A goblin mage.", reasons })),
    );
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: ollamaProvider({ fetch }) });

    expect(result.status).toBe("accepted");
    expect(result.build).toEqual(goblinoid);
    expect(result.turns).toBe(3);

    const first = bodies[0]!;
    expect(first.tools).toBeUndefined();
    expect((first.format as { required: string[] }).required).toEqual(["build", "summary", "reasons"]);
    expect((first.messages as { content: string }[])[0]!.content).toContain("You can't call tools here");

    // The engine's errors go back as a user message.
    const second = bodies[1]!.messages as { role: string; content: string }[];
    expect(second.at(-1)!.role).toBe("user");
    expect(second.at(-1)!.content).toContain("The rules engine rejected that build");
    expect(second.at(-1)!.content).toContain("each level gives exactly 3");
    // An answer that isn't JSON gets a reminder of the format.
    const third = bodies[2]!.messages as { role: string; content: string }[];
    expect(third.at(-1)!.content).toBe("Answer with the full build as JSON in the requested format: build, summary and reasons.");
  });
});
