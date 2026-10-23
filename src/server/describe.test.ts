import { describe, expect, it, vi } from "vitest";
import { DEFAULT_OLLAMA_MODEL, ollamaProvider } from "../ai/ollama.js";
import { loadContent } from "../engine/content.js";
import { handleDescribe, MISSING_KEY_MESSAGE, providerFor, settingsFromEnv } from "./describe.js";

const { content } = loadContent();

describe("model settings", () => {
  it("builds with local Ollama and Qwen in tools mode unless told otherwise", () => {
    const settings = settingsFromEnv({});
    expect(settings.provider).toBe("ollama");
    expect(settings.ollamaMode).toBeUndefined();
    expect(providerFor(settings)?.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(DEFAULT_OLLAMA_MODEL).toBe("qwen3:30b-a3b");
  });

  it("keeps DeepSeek available through .env", () => {
    const settings = settingsFromEnv({ OLLAMA_MODEL: "deepseek-r1:14b", OLLAMA_MODE: "json" });
    expect(settings.ollamaMode).toBe("json");
    expect(providerFor(settings)?.model).toBe("deepseek-r1:14b");
  });

  it("picks the Claude model from ANTHROPIC_MODEL", () => {
    const settings = settingsFromEnv({ SF_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-haiku-5-5" });
    expect(providerFor(settings)?.model).toBe("claude-haiku-5-5");
  });

  it("uses the Claude API only with SF_PROVIDER=anthropic and a key", () => {
    expect(providerFor(settingsFromEnv({ SF_PROVIDER: "anthropic" }))).toBeUndefined();
    expect(providerFor(settingsFromEnv({ SF_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key" }))?.model).toBe("claude-opus-5-5");
  });
});

describe("handleDescribe", () => {
  it("asks for a key in .env when the Claude API is chosen without one", async () => {
    for (const apiKey of [undefined, "", "   "]) {
      const settings = settingsFromEnv({ SF_PROVIDER: "anthropic", ANTHROPIC_API_KEY: apiKey });
      const reply = await handleDescribe({ description: "A goblin mage." }, { settings, content });
      expect(reply).toEqual({ status: 503, body: { error: "missing-key", message: MISSING_KEY_MESSAGE } });
    }
    expect(MISSING_KEY_MESSAGE).toContain(".env");
  });

  it("rejects an empty description without calling a model", async () => {
    const fetch = vi.fn();
    const reply = await handleDescribe(
      { description: "  " },
      { settings: settingsFromEnv({}), content, makeProvider: () => ollamaProvider({ fetch }) },
    );
    expect(reply.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("builds at a level the description asks for", async () => {
    const sent: string[] = [];
    const fetch = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      sent.push(String(init?.body ?? ""));
      throw new TypeError("fetch failed");
    });
    const makeProvider = () => ollamaProvider({ fetch });
    await handleDescribe({ description: "A level 5 Isek scout.", startingLevel: 3 }, { settings: settingsFromEnv({}), content, makeProvider });
    await handleDescribe({ description: "An Isek scout.", startingLevel: 3 }, { settings: settingsFromEnv({}), content, makeProvider });
    expect(sent[0]).toContain("starts characters at level 5");
    expect(sent[1]).toContain("starts characters at level 3");
  });

  it("says to open Ollama when it isn't running", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const reply = await handleDescribe(
      { description: "A goblin mage." },
      { settings: settingsFromEnv({}), content, makeProvider: () => ollamaProvider({ fetch }) },
    );
    expect(reply.status).toBe(503);
    expect(reply.body).toEqual({ error: "unavailable", message: expect.stringContaining("Open the Ollama app") });
  });

  it("says how to pull a missing model", async () => {
    const fetch = vi.fn(async () => Response.json({ error: 'model "qwen3:30b-a3b" not found, try pulling it first' }, { status: 404 }));
    const reply = await handleDescribe(
      { description: "A goblin mage." },
      { settings: settingsFromEnv({}), content, makeProvider: () => ollamaProvider({ fetch }) },
    );
    expect(reply.body).toEqual({ error: "unavailable", message: "Ollama doesn't have qwen3:30b-a3b yet. Run: ollama pull qwen3:30b-a3b" });
  });
});
