import { describe, expect, it, vi } from "vitest";
import { DEFAULT_OLLAMA_MODEL, ollamaProvider } from "../ai/ollama.js";
import { loadContent } from "../engine/content.js";
import { handleDescribe, MISSING_KEY_MESSAGE, providerFor, settingsFromEnv } from "./describe.js";

const { content } = loadContent();

describe("model settings", () => {
  it("builds with local Ollama and DeepSeek unless told otherwise", () => {
    const settings = settingsFromEnv({});
    expect(settings.provider).toBe("ollama");
    expect(providerFor(settings)?.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(DEFAULT_OLLAMA_MODEL).toBe("deepseek-r1:14b");
    expect(providerFor(settingsFromEnv({ OLLAMA_MODEL: "qwen3:30b-a3b" }))?.model).toBe("qwen3:30b-a3b");
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
    const fetch = vi.fn(async () => Response.json({ error: 'model "deepseek-r1:14b" not found, try pulling it first' }, { status: 404 }));
    const reply = await handleDescribe(
      { description: "A goblin mage." },
      { settings: settingsFromEnv({}), content, makeProvider: () => ollamaProvider({ fetch }) },
    );
    expect(reply.body).toEqual({ error: "unavailable", message: "Ollama doesn't have deepseek-r1:14b yet. Run: ollama pull deepseek-r1:14b" });
  });
});
