// What the describe endpoint sends back. Shared by the server and the browser,
// so nothing here imports the Anthropic SDK or reads from disk.
import type { BuildInput } from "../engine/build.js";
import type { BuildSummary, Issue } from "../engine/validate.js";

// One line on why the model made a choice. `target` names the part of the build:
// "kind", "form", "origin", "profession", "past", "levels", a Trait id from
// the build's picks, or "choice:<package>/<pool>".
export interface Reason {
  target: string;
  reason: string;
}

// A package choice the model leaves for the player: a Contact, which the
// player decides, or a pool with no Traits in content yet.
export interface OpenChoice {
  package: string;
  from: string;
  count: number;
  note?: string;
}

// An id in a proposed build that doesn't exist in content, or an answer to a
// pool that has no content. Rejected in code, whatever the prompt says.
export interface IdIssue {
  path: string;
  message: string;
}

export interface BuildCheck {
  // No unknown ids and no engine errors, once open choices are set aside.
  accepted: boolean;
  // What validateBuild says about the build exactly as proposed.
  legal: boolean;
  unknownIds: IdIssue[];
  errors: Issue[];
  warnings: Issue[];
  openChoices: OpenChoice[];
  summary?: BuildSummary;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface DescribeResult {
  // "accepted": the model submitted a build the engine accepts. "turn-limit":
  // the loop stopped first, and `build` is the last one it proposed.
  status: "accepted" | "turn-limit";
  // The model that built it, e.g. "qwen3:30b-a3b".
  model: string;
  build?: BuildInput;
  // One or two sentences on the character, in the model's words.
  summary?: string;
  reasons: Reason[];
  check?: BuildCheck;
  turns: number;
  usage: Usage;
}

export interface DescribeRequest {
  description: string;
  startingLevel?: number;
}

export interface DescribeError {
  error: "missing-key" | "unavailable" | "bad-request" | "auth" | "rate-limit" | "api" | "refused" | "server";
  message: string;
}
