// The local AI server. `npm run dev` runs it next to Vite, which proxies
// /api here. With Claude, the builder runs its loop in the browser and sends
// each turn to /api/messages, which adds the key; with SF_PROVIDER=ollama the
// browser asks /api/describe for the whole build. Settings come from .env on
// this side only: the API key never goes to the browser and is never logged.
import { createServer, type IncomingMessage } from "node:http";
import { loadContent } from "../engine/content.js";
import { DEFAULT_OLLAMA_HOST, DEFAULT_OLLAMA_MODEL } from "../ai/ollama.js";
import type { DescribeEvent } from "../ai/types.js";
import { handleDescribe, handleMessages, settingsFromEnv } from "./describe.js";

try {
  process.loadEnvFile();
} catch {
  // No .env yet; the defaults (local Ollama) apply.
}

const PORT = Number(process.env.AI_PORT ?? 8787);
const MAX_BODY = 64 * 1024;
// A Claude turn carries the instructions, the content index and the
// conversation so far.
const MAX_MESSAGES_BODY = 4 * 1024 * 1024;

const settings = settingsFromEnv(process.env);
const { content, errors } = loadContent();
if (errors.length) console.error(`Content has ${errors.length} problem(s); run npm run validate.`);

async function readJson(req: IncomingMessage, limit = MAX_BODY): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.url !== "/api/describe" && req.url !== "/api/messages") return send(404, { error: "server", message: "Not found" });
  if (req.method !== "POST") return send(405, { error: "bad-request", message: "Use POST" });

  if (req.url === "/api/messages") {
    let turn: unknown;
    try {
      turn = await readJson(req, MAX_MESSAGES_BODY);
    } catch {
      return send(400, { error: "bad-request", message: "The request body must be JSON under 4 MB." });
    }
    const started = Date.now();
    try {
      const reply = await handleMessages(turn, settings);
      console.log(`messages → ${reply.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return send(reply.status, reply.body);
    } catch (err) {
      console.error("messages failed:", err instanceof Error ? err.message : "unknown error");
      return send(500, { error: "server", message: "Something went wrong on the AI server. Check the terminal running npm run dev." });
    }
  }

  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return send(400, { error: "bad-request", message: "The request body must be JSON under 64 KB." });
  }
  const started = Date.now();
  // Once the build starts, the reply is a stream of newline-delimited JSON:
  // progress lines, then the result or error. Errors before that (a missing
  // key, a bad request) are a plain JSON reply with an error status.
  let streaming = false;
  const line = (event: DescribeEvent) => {
    if (!streaming) {
      streaming = true;
      res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
    }
    res.write(`${JSON.stringify(event)}\n`);
  };
  try {
    const reply = await handleDescribe(body, { settings, content }, (p) => line({ type: "progress", ...p }));
    const b = reply.body;
    const detail = "status" in b ? `${b.status}, ${b.turns} turn(s)` : b.error;
    console.log(`describe → ${reply.status} (${detail}) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (!streaming) return send(reply.status, b);
    line("status" in b ? { type: "result", result: b } : { type: "error", error: b });
    res.end();
  } catch (err) {
    console.error("describe failed:", err instanceof Error ? err.message : "unknown error");
    const error = { error: "server" as const, message: "Something went wrong on the AI server. Check the terminal running npm run dev." };
    if (!streaming) return send(500, error);
    line({ type: "error", error });
    res.end();
  }
});

// Local models can take several minutes over a long repair loop.
server.requestTimeout = 15 * 60_000;

server.listen(PORT, "127.0.0.1", () => {
  const using =
    settings.provider === "ollama"
      ? `Ollama ${settings.ollamaModel ?? DEFAULT_OLLAMA_MODEL} at ${settings.ollamaHost ?? DEFAULT_OLLAMA_HOST}`
      : `Claude API · key ${settings.apiKey ? "found" : "missing (add it to .env)"}`;
  console.log(`AI server on http://127.0.0.1:${PORT} · building with ${using}`);
});
