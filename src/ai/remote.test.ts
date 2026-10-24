// The browser side of a Claude build, against a fake endpoint. Nothing here
// calls the real API.
import { describe, expect, it } from "vitest";
import { loadContent } from "../engine/content.js";
import { describeRemote, EndpointError, endpointCreate } from "./remote.js";

const { content } = loadContent();

// A fetch that records each request and answers with `status` and `body`.
function fakeFetch(status: number, body: unknown) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { fetcher, requests };
}

const params = { model: "claude-haiku-5-5", max_tokens: 10, messages: [{ role: "user" as const, content: "Hi" }] };

describe("endpointCreate", () => {
  it("posts the Messages API request to the endpoint and returns its message", async () => {
    const reply = { id: "msg_1", type: "message", content: [] };
    const { fetcher, requests } = fakeFetch(200, reply);
    expect(await endpointCreate("creator-api.php", fetcher)(params)).toEqual(reply);
    expect(requests).toEqual([{ url: "creator-api.php", body: params }]);
  });

  it("passes the endpoint's error through", async () => {
    const { fetcher } = fakeFetch(429, { error: "rate-limit", message: "Slow down." });
    await expect(endpointCreate("api/messages", fetcher)(params)).rejects.toEqual(new EndpointError("rate-limit", "Slow down."));
  });

  it("names the status when the error has no details", async () => {
    const { fetcher } = fakeFetch(500, "oops");
    await expect(endpointCreate("api/messages", fetcher)(params)).rejects.toThrow("The AI server answered 500 with no details.");
  });

  it("says when the endpoint can't be reached", async () => {
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(endpointCreate("api/messages", offline)(params)).rejects.toMatchObject({ error: "server" });
  });
});

describe("describeRemote", () => {
  it("builds with the given model and returns the endpoint's error as a reply", async () => {
    const { fetcher, requests } = fakeFetch(503, { error: "missing-key", message: "No key." });
    const reply = await describeRemote({ description: "A goblin mage.", startingLevel: 3, content, endpoint: "api/messages", model: "claude-haiku-5-5", fetcher });
    expect(reply).toEqual({ error: "missing-key", message: "No key." });
    expect(requests[0]!.body.model).toBe("claude-haiku-5-5");
  });

  it("builds at the level set by hand when told to, and passes the name on", async () => {
    const { fetcher, requests } = fakeFetch(503, { error: "missing-key", message: "No key." });
    await describeRemote({ description: "A level 5 goblin mage.", startingLevel: 8, levelFromText: false, name: "Pell", content, endpoint: "api/messages", model: "claude-haiku-5-5", fetcher });
    const first = JSON.stringify(requests[0]!.body.messages);
    expect(first).toContain("starts characters at level 8");
    expect(first).toContain('named this character \\"Pell\\". Use that name.');
  });
});
