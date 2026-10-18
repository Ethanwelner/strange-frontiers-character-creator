// Handles POST /api/describe. Kept apart from the HTTP server so it can be
// tested without a network or an API key.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Content } from "../engine/parse.js";
import { DescribeFailure, describeCharacter, type CreateMessage } from "../ai/loop.js";
import type { DescribeError, DescribeResult } from "../ai/types.js";

export const MISSING_KEY_MESSAGE =
  "No Anthropic API key found. Add ANTHROPIC_API_KEY=your-key to the .env file in the project folder (see .env.example), then restart npm run dev.";

const Request = z.object({
  description: z.string().trim().min(1, "Describe the character first.").max(4000, "Keep the description under 4,000 characters."),
  startingLevel: z.number().int().min(1).max(20).default(1),
});

export interface Reply {
  status: number;
  body: DescribeResult | DescribeError;
}

export interface Deps {
  apiKey: string | undefined;
  content: Content;
  // Makes the API call from a key. Tests replace it.
  makeCreate?: (apiKey: string) => CreateMessage;
}

const sdkCreate = (apiKey: string): CreateMessage => {
  const client = new Anthropic({ apiKey });
  return (params) => client.beta.messages.create(params);
};

const fail = (status: number, error: DescribeError["error"], message: string): Reply => ({ status, body: { error, message } });

export async function handleDescribe(body: unknown, deps: Deps): Promise<Reply> {
  const apiKey = deps.apiKey?.trim();
  if (!apiKey) return fail(503, "missing-key", MISSING_KEY_MESSAGE);

  const parsed = Request.safeParse(body);
  if (!parsed.success) return fail(400, "bad-request", parsed.error.issues.map((i) => i.message).join("; "));

  const create = (deps.makeCreate ?? sdkCreate)(apiKey);
  try {
    const result = await describeCharacter({
      description: parsed.data.description,
      content: deps.content,
      campaign: { startingLevel: parsed.data.startingLevel },
      create,
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err instanceof DescribeFailure) return fail(502, err.kind === "refused" ? "refused" : "api", err.message);
    if (err instanceof Anthropic.AuthenticationError) {
      return fail(401, "auth", "The Anthropic API rejected the key in .env. Check ANTHROPIC_API_KEY, then restart npm run dev.");
    }
    if (err instanceof Anthropic.RateLimitError) return fail(429, "rate-limit", "The Anthropic API is rate limiting requests. Wait a minute and try again.");
    if (err instanceof Anthropic.APIConnectionError) return fail(502, "api", "Couldn't reach the Anthropic API. Check your connection and try again.");
    if (err instanceof Anthropic.APIError) return fail(502, "api", `The Anthropic API returned an error (${err.status ?? "no status"}): ${err.message}`);
    throw err;
  }
}
