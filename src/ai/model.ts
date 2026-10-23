// What the build loop needs from a model, whichever one it is. Each adapter
// (anthropic.ts, ollama.ts) keeps its own conversation in its own format.
import type { Usage } from "./types.js";

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  call: ToolCall;
  content: string;
  isError?: boolean;
}

export interface Turn {
  calls: ToolCall[];
  usage: Partial<Usage>;
}

export interface SendOptions {
  // Whether the model should reason before answering, for adapters that can
  // turn it off. Defaults to on.
  think?: boolean;
}

export interface ChatSession {
  // Sends the conversation so far and returns the model's tool calls.
  // onThinking, when the adapter can stream, gets the reasoning so far.
  send(onThinking?: (text: string) => void, options?: SendOptions): Promise<Turn>;
  // Every call from the last turn gets a result, in one batch.
  addResults(results: ToolResult[]): void;
  // A plain user message, for when the model answered without a tool.
  nudge(text: string): void;
}

export interface Prompt {
  // The fixed instructions, then the content index.
  instructions: string;
  index: string;
  // The per-request part: starting level and the player's description.
  user: string;
}

export interface Provider {
  // Shown to the player, e.g. "qwen3:30b-a3b".
  model: string;
  maxTurns: number;
  // Gets one review turn after its first legal build, to drop Traits that
  // don't fit and fill in missing reasons. For fast models (the Claude API);
  // the others get one push to spend unspent picks instead.
  review?: boolean;
  start(prompt: Prompt): ChatSession;
}

export class DescribeFailure extends Error {
  constructor(
    readonly kind: "refused" | "truncated" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}
