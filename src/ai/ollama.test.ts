// The loop through the Ollama adapter, against a scripted fake of Ollama's
// /api/chat. Nothing here needs Ollama running.
import { describe, expect, it, vi } from "vitest";
import { loadContent } from "../engine/content.js";
import type { ConceptInput } from "../engine/solve.js";
import { describeCharacter } from "./loop.js";
import { ollamaProvider, type Fetch } from "./ollama.js";

const { content } = loadContent();

const goblinoid: ConceptInput = {
  kind: "tatot",
  form: "goblinoid",
  origin: "tetra",
  profession: "licensed-mage",
  past: "raised-in-the-caravan-town",
  focus: ["logic", "memory"],
  traits: [
    "tinkerer", "herbalism", "appraisal", "smooth-talker", "vigilance", "tracker", "survivalist",
    "ambusher", "haggler", "streetwise", "sleight-of-hand", "teamster", "relic-handling", "schemer",
  ],
};

const reasons = ["kind", "form", "origin", "profession", "past", "levels", ...goblinoid.traits!].map((target) => ({ target, reason: "fits" }));

const reply = (toolCalls: { name: string; arguments: unknown }[], extra: object = {}) =>
  Response.json({
    message: { role: "assistant", content: "", thinking: "hmm", tool_calls: toolCalls.map((f) => ({ function: f })) },
    done: true,
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

describe("ollamaProvider, tools mode (the default)", () => {
  it("runs the loop with tool calls and returns an accepted build", async () => {
    const { fetch, bodies } = script(
      reply([{ name: "get_kind", arguments: { id: "tatot" } }]),
      // Some models send arguments as a JSON string.
      reply([{ name: "submit_build", arguments: JSON.stringify({ concept: goblinoid, summary: "A goblin mage.", reasons }) }]),
    );
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: ollamaProvider({ fetch, host: "http://ollama.test/" }) });

    expect(result.status).toBe("accepted");
    expect(result.model).toBe("qwen3:30b-a3b");
    expect(result.build).toEqual(expect.objectContaining({ kind: "tatot", form: "goblinoid" }));
    expect(result.check?.legal).toBe(true);
    expect(result.usage.inputTokens).toBe(2000);
    expect(fetch.mock.calls[0]![0]).toBe("http://ollama.test/api/chat");

    const first = bodies[0]!;
    expect(first.model).toBe("qwen3:30b-a3b");
    expect(first.stream).toBe(true);
    const tools = first.tools as { function: { name: string } }[];
    expect(tools.map((t) => t.function.name)).toEqual(["search_traits", "list_packages", "get_package", "get_kind", "submit_build"]);
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
      reply([{ name: "submit_build", arguments: { concept: goblinoid, summary: "A goblin mage.", reasons } }]),
    );
    await describeCharacter({ description: "A goblin mage.", content, provider: ollamaProvider({ fetch, mode: "tools" }) });
    const messages = bodies[1]!.messages as { content: string }[];
    expect(messages.at(-1)!.content).toMatch(/^Error: No package "pirate-king"/);
  });

  it("thinks until the first submit, then repairs without reasoning", async () => {
    const { form: _form, ...formless } = goblinoid;
    const { fetch, bodies } = script(
      reply([{ name: "get_kind", arguments: { id: "tatot" } }]),
      reply([{ name: "submit_build", arguments: { concept: formless, summary: "A goblin mage.", reasons } }]),
      reply([{ name: "submit_build", arguments: { concept: goblinoid, summary: "A goblin mage.", reasons } }]),
    );
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: ollamaProvider({ fetch }) });
    expect(result.status).toBe("accepted");
    expect(bodies.map((b) => b.think)).toEqual([true, true, false]);
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
  Response.json({ message: { role: "assistant", content, thinking: "hmm" }, done: true, done_reason: "stop", prompt_eval_count: 1000, eval_count: 200 });

describe("ollamaProvider, JSON mode", () => {
  it("asks for a concept in the submit_build format and repairs from the engine's verdict", async () => {
    const { form: _form, ...broken } = goblinoid;
    const { fetch, bodies } = script(
      answer(JSON.stringify({ concept: broken, summary: "A goblin mage.", reasons })),
      answer("Sorry, here it is in prose."),
      answer(JSON.stringify({ concept: goblinoid, summary: "A goblin mage.", reasons })),
    );
    const result = await describeCharacter({ description: "A goblin mage.", content, provider: ollamaProvider({ fetch, model: "deepseek-r1:14b", mode: "json" }) });

    expect(result.status).toBe("accepted");
    expect(result.build).toEqual(expect.objectContaining({ kind: "tatot", form: "goblinoid" }));
    expect(result.turns).toBe(3);

    const first = bodies[0]!;
    expect(first.tools).toBeUndefined();
    expect((first.format as { required: string[] }).required).toEqual(["concept", "summary", "reasons"]);
    expect((first.messages as { content: string }[])[0]!.content).toContain("You can't call tools here");

    // The engine's errors go back as a user message.
    const second = bodies[1]!.messages as { role: string; content: string }[];
    expect(second.at(-1)!.role).toBe("user");
    expect(second.at(-1)!.content).toContain("The rules engine sent that back");
    expect(second.at(-1)!.content).toContain("Tatot needs a form");
    // An answer that isn't JSON gets a reminder of the format.
    const third = bodies[2]!.messages as { role: string; content: string }[];
    expect(third.at(-1)!.content).toBe("Answer with the character as JSON in the requested format: concept, summary and reasons.");
  });
});

describe("ollamaProvider streaming", () => {
  it("assembles a streamed reply and reports progress, reasoning included", async () => {
    const lines = [
      { message: { role: "assistant", content: "", thinking: "The player wants a goblin. " } },
      { message: { role: "assistant", content: "", thinking: "Tatot goblinoid fits." } },
      { message: { role: "assistant", content: "", tool_calls: [{ function: { name: "submit_build", arguments: { concept: goblinoid, summary: "A goblin mage.", reasons } } }] } },
      { message: { role: "assistant", content: "" }, done: true, done_reason: "stop", prompt_eval_count: 1000, eval_count: 200 },
    ];
    const text = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
    // Split mid-line, the way a network stream can.
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        const bytes = new TextEncoder().encode(text);
        c.enqueue(bytes.slice(0, 37));
        c.enqueue(bytes.slice(37));
        c.close();
      },
    });
    const fetch = vi.fn<Fetch>(async () => new Response(stream));
    const progress: string[] = [];
    const result = await describeCharacter({
      description: "A goblin mage.",
      content,
      provider: ollamaProvider({ fetch }),
      onProgress: (p) => progress.push(`${p.turn}/${p.maxTurns} ${p.status}`),
    });

    expect(result.status).toBe("accepted");
    expect(result.usage.outputTokens).toBe(200);
    expect(progress[0]).toBe("1/20 Thinking");
    expect(progress).toContain("1/20 Thinking: The player wants a goblin.");
    expect(progress).toContain("1/20 Submitting the build");
    expect(progress.at(-1)).toBe("1/20 Done");
  });
});
