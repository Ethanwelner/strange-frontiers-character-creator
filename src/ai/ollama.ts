// The local adapter: a model served by Ollama on this machine. Free and
// private; the engine still checks everything it proposes.
//
// Two modes. "tools" (the default) uses native tool calling, like the Claude
// adapter; qwen3:30b-a3b handles it well. "json" works with models that
// don't call tools: each turn the model answers with a full build in
// Ollama's structured-output format, and the engine's verdict goes back as
// the next message. deepseek-r1:14b writes prose instead of calling tools,
// and in JSON mode it resubmits the same build without fixing it, so it
// isn't the default.
import { DescribeFailure, type ChatSession, type Prompt, type Provider, type ToolCall, type ToolResult } from "./model.js";
import { TOOLS } from "./tools.js";

export const DEFAULT_OLLAMA_MODEL = "qwen3:30b-a3b";
export const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";

// fetch, so tests can replace it.
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type OllamaMode = "json" | "tools";

export interface OllamaOptions {
  model?: string;
  host?: string;
  mode?: OllamaMode;
  maxTurns?: number;
  fetch?: Fetch;
}

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { function: { name: string; arguments: unknown } }[];
  tool_name?: string;
}

interface OllamaReply {
  message?: OllamaMessage & { thinking?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

// Ollama takes OpenAI-style function tools.
const OLLAMA_TOOLS = TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

const SUBMIT_SCHEMA = TOOLS.find((t) => t.name === "submit_build")!.input_schema;

const JSON_MODE_NOTE =
  "You can't call tools here. Answer every time with the full build as JSON in the requested format: build, summary and reasons. " +
  "The rules engine checks it and replies with any problems; fix all of them and answer with the whole corrected build. " +
  "Use the content index below for ids. A build's choices only answer the choices its packages list.";

const JSON_MODE_RETRY = "Answer with the full build as JSON in the requested format: build, summary and reasons.";

// Local models are slower to converge, so they get more repair turns.
export function ollamaProvider(opts: OllamaOptions = {}): Provider {
  const model = opts.model || DEFAULT_OLLAMA_MODEL;
  const host = (opts.host || DEFAULT_OLLAMA_HOST).replace(/\/+$/, "");
  const mode = opts.mode ?? "tools";
  const doFetch = opts.fetch ?? ((url, init) => fetch(url, init));
  return { model, maxTurns: opts.maxTurns ?? 20, start: (prompt) => new OllamaSession(model, host, mode, doFetch, prompt) };
}

const parseArgs = (args: unknown): unknown => {
  if (typeof args !== "string") return args;
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
};

class OllamaSession implements ChatSession {
  private messages: OllamaMessage[];
  private turn = 0;

  constructor(
    private model: string,
    private host: string,
    private mode: OllamaMode,
    private doFetch: Fetch,
    prompt: Prompt,
  ) {
    const note = mode === "json" ? `\n\n${JSON_MODE_NOTE}` : "";
    this.messages = [
      { role: "system", content: `${prompt.instructions}${note}\n\n${prompt.index}` },
      { role: "user", content: prompt.user },
    ];
  }

  async send() {
    this.turn++;
    let res: Response;
    try {
      res = await this.doFetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: this.messages,
          ...(this.mode === "json" ? { format: SUBMIT_SCHEMA } : { tools: OLLAMA_TOOLS }),
          stream: false,
          // Reasoning models keep their thinking out of the reply.
          think: true,
          options: { num_ctx: 32768, num_predict: 8192 },
        }),
      });
    } catch {
      throw new DescribeFailure("unavailable", `Can't reach Ollama at ${this.host}. Open the Ollama app, then try again.`);
    }
    const body = (await res.json().catch(() => ({}))) as OllamaReply;
    if (!res.ok || body.error) {
      const error = body.error ?? `HTTP ${res.status}`;
      if (/not found/i.test(error)) {
        throw new DescribeFailure("unavailable", `Ollama doesn't have ${this.model} yet. Run: ollama pull ${this.model}`);
      }
      throw new DescribeFailure("unavailable", `Ollama returned an error: ${error}`);
    }
    if (body.done_reason === "length") {
      throw new DescribeFailure("truncated", `${this.model}'s response was cut off before it finished the build.`);
    }
    const message = body.message ?? { role: "assistant", content: "" };
    const usage = { inputTokens: body.prompt_eval_count ?? 0, outputTokens: body.eval_count ?? 0 };
    if (this.mode === "json") {
      this.messages.push({ role: "assistant", content: message.content ?? "" });
      const input = parseArgs(message.content ?? "");
      // Anything but a JSON object counts as no answer; the loop nudges.
      if (typeof input !== "object" || input === null) return { calls: [], usage };
      return { calls: [{ id: `call_${this.turn}_0`, name: "submit_build", input }], usage };
    }
    const toolCalls = message.tool_calls ?? [];
    this.messages.push({ role: "assistant", content: message.content ?? "", ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    const calls: ToolCall[] = toolCalls.map((c, i) => ({
      id: `call_${this.turn}_${i}`,
      name: c.function.name,
      input: parseArgs(c.function.arguments),
    }));
    return { calls, usage };
  }

  addResults(results: ToolResult[]) {
    if (this.mode === "json") {
      // Only submit_build happens in JSON mode: its result is the engine's verdict.
      const verdict = results.map((r) => r.content).join("\n");
      this.messages.push({ role: "user", content: `The rules engine rejected that build:\n${verdict}\n\nFix every problem and answer with the full corrected build.` });
      return;
    }
    for (const r of results) {
      this.messages.push({ role: "tool", tool_name: r.call.name, content: r.isError ? `Error: ${r.content}` : r.content });
    }
  }

  nudge(text: string) {
    this.messages.push({ role: "user", content: this.mode === "json" ? JSON_MODE_RETRY : text });
  }
}
