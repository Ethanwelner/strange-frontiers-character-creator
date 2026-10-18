// What the describe endpoint sends back. Shared by the server and the browser,
// so nothing here imports the Anthropic SDK or reads from disk.
import type { BuildInput } from "../engine/build.js";
import type { BuildSummary, Issue } from "../engine/validate.js";

// One line on why Claude made a choice. `target` names the part of the build:
// "kind", "form", "origin", "profession", "past", "levels", a Trait id from
// the build's picks, or "choice:<package>/<pool>".
export interface Reason {
  target: string;
  reason: string;
}

// A package choice whose pool has no Traits in content yet (Contacts and
// Dreftian languages, for now). Claude can't answer it without inventing an
// id, so it's left for the player.
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
  // "accepted": Claude submitted a build the engine accepts. "turn-limit":
  // the loop stopped first, and `build` is the last one Claude proposed.
  status: "accepted" | "turn-limit";
  build?: BuildInput;
  // One or two sentences on the character, in Claude's words.
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
  error: "missing-key" | "bad-request" | "auth" | "rate-limit" | "api" | "refused" | "server";
  message: string;
}
