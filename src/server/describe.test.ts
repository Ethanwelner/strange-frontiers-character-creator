import { describe, expect, it, vi } from "vitest";
import { loadContent } from "../engine/content.js";
import { handleDescribe, MISSING_KEY_MESSAGE } from "./describe.js";

const { content } = loadContent();

describe("handleDescribe", () => {
  it("asks for a key in .env when there isn't one, without calling the API", async () => {
    const makeCreate = vi.fn();
    for (const apiKey of [undefined, "", "   "]) {
      const reply = await handleDescribe({ description: "A goblin mage." }, { apiKey, content, makeCreate });
      expect(reply).toEqual({ status: 503, body: { error: "missing-key", message: MISSING_KEY_MESSAGE } });
    }
    expect(MISSING_KEY_MESSAGE).toContain(".env");
    expect(makeCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty description", async () => {
    const makeCreate = vi.fn();
    const reply = await handleDescribe({ description: "  " }, { apiKey: "test-key", content, makeCreate });
    expect(reply.status).toBe(400);
    expect(makeCreate).not.toHaveBeenCalled();
  });
});
