// Handles POST /api/describe. Kept apart from the HTTP server so it can be
// tested without a network, a model or an API key.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { anthropicProvider } from "../ai/anthropic.js";
import { describeCharacter } from "../ai/loop.js";
import { DescribeFailure, type Provider } from "../ai/model.js";
import { ollamaProvider } from "../ai/ollama.js";
import type { DescribeError, DescribeResult, Progress } from "../ai/types.js";
import type { Content } from "../engine/parse.js";

export const MISSING_KEY_MESSAGE =
  "No Anthropic API key found. Add ANTHROPIC_API_KEY=your-key to the .env file in the project folder (see .env.example), then restart npm run dev. Or set SF_PROVIDER=ollama to build with a local model.";

const Request = z.object({
  description: z.string().trim().min(1, "Describe the character first.").max(4000, "Keep the description under 4,000 characters."),
  startingLevel: z.number().int().min(1).max(20).default(1),
});

export interface Reply {
  status: number;
  body: DescribeResult | DescribeError;
}

// Which model builds characters, from .env. Ollama (local, free) unless
// SF_PROVIDER=anthropic.
export interface ModelSettings {
  provider: "ollama" | "anthropic";
  ollamaModel?: string;
  ollamaHost?: string;
  ollamaMode?: "json" | "tools";
  apiKey?: string;
}

export function settingsFromEnv(env: NodeJS.ProcessEnv): ModelSettings {
  return {
    provider: env.SF_PROVIDER?.trim().toLowerCase() === "anthropic" ? "anthropic" : "ollama",
    ollamaModel: env.OLLAMA_MODEL?.trim() || undefined,
    ollamaHost: env.OLLAMA_HOST?.trim() || undefined,
    ollamaMode: env.OLLAMA_MODE?.trim().toLowerCase() === "json" ? "json" : undefined,
    apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
  };
}

// The provider for these settings, or undefined when the Claude API is
// chosen and there's no key.
export function providerFor(settings: ModelSettings): Provider | undefined {
  if (settings.provider === "ollama") return ollamaProvider({ model: settings.ollamaModel, host: settings.ollamaHost, mode: settings.ollamaMode });
  if (!settings.apiKey) return undefined;
  const client = new Anthropic({ apiKey: settings.apiKey });
  return anthropicProvider((params) => client.beta.messages.create(params));
}

export interface Deps {
  settings: ModelSettings;
  content: Content;
  // Tests replace it.
  makeProvider?: (settings: ModelSettings) => Provider | undefined;
}

const fail = (status: number, error: DescribeError["error"], message: string): Reply => ({ status, body: { error, message } });

// onProgress gets live status lines while the build runs.
export async function handleDescribe(body: unknown, deps: Deps, onProgress?: (p: Progress) => void): Promise<Reply> {
  const provider = (deps.makeProvider ?? providerFor)(deps.settings);
  if (!provider) return fail(503, "missing-key", MISSING_KEY_MESSAGE);

  const parsed = Request.safeParse(body);
  if (!parsed.success) return fail(400, "bad-request", parsed.error.issues.map((i) => i.message).join("; "));

  try {
    const result = await describeCharacter({
      description: parsed.data.description,
      content: deps.content,
      campaign: { startingLevel: parsed.data.startingLevel },
      provider,
      onProgress,
    });
    return { status: 200, body: result };
  } catch (err) {
    if (err instanceof DescribeFailure) {
      if (err.kind === "unavailable") return fail(503, "unavailable", err.message);
      return fail(502, err.kind === "refused" ? "refused" : "api", err.message);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return fail(401, "auth", "The Anthropic API rejected the key in .env. Check ANTHROPIC_API_KEY, then restart npm run dev.");
    }
    if (err instanceof Anthropic.RateLimitError) return fail(429, "rate-limit", "The Anthropic API is rate limiting requests. Wait a minute and try again.");
    if (err instanceof Anthropic.APIConnectionError) return fail(502, "api", "Couldn't reach the Anthropic API. Check your connection and try again.");
    if (err instanceof Anthropic.APIError) return fail(502, "api", `The Anthropic API returned an error (${err.status ?? "no status"}): ${err.message}`);
    throw err;
  }
}
