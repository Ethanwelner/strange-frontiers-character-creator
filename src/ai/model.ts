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

export interface ChatSession {
  // Sends the conversation so far and returns the model's tool calls.
  send(): Promise<Turn>;
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
