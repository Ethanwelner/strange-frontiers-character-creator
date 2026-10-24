// Runs the AI loop in the browser. Each Claude turn goes to an endpoint that
// adds the API key and passes it on: the local AI server's /api/messages in
// development, the website's PHP proxy in production. No key is ever here.
import type Anthropic from "@anthropic-ai/sdk";
import type { Content } from "../engine/parse.js";
import { anthropicProvider, type CreateMessage } from "./anthropic.js";
import { levelFromDescription } from "./level.js";
import { describeCharacter } from "./loop.js";
import { DescribeFailure } from "./model.js";
import type { DescribeError, DescribeResult, Progress } from "./types.js";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

// An error reply from the endpoint, shown to the player as the endpoint wrote it.
export class EndpointError extends Error {
  constructor(
    readonly error: DescribeError["error"],
    message: string,
  ) {
    super(message);
  }
}

// One Claude turn through the endpoint. It answers with the API's message, or
// with a DescribeError and an error status.
export function endpointCreate(endpoint: string, fetcher: Fetcher = (url, init) => fetch(url, init)): CreateMessage {
  return async (params) => {
    let res: Response;
    try {
      res = await fetcher(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(params) });
    } catch {
      throw new EndpointError("server", "Couldn't reach the AI server. Check your connection, or start it with npm run dev when working locally.");
    }
    const body: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const e = body as Partial<DescribeError> | undefined;
      throw new EndpointError(e?.error ?? "api", e?.message ?? `The AI server answered ${res.status} with no details.`);
    }
    return body as Anthropic.Beta.BetaMessage;
  };
}

export interface RemoteOptions {
  description: string;
  startingLevel: number;
  // A level written in the description ("level 10") wins over startingLevel,
  // unless this is false, as when the player set the level by hand.
  levelFromText?: boolean;
  name?: string;
  content: Content;
  endpoint: string;
  model: string;
  onProgress?: (p: Progress) => void;
  fetcher?: Fetcher;
}

export async function describeRemote(opts: RemoteOptions): Promise<DescribeResult | DescribeError> {
  const provider = anthropicProvider(endpointCreate(opts.endpoint, opts.fetcher), undefined, opts.model);
  try {
    return await describeCharacter({
      description: opts.description,
      name: opts.name,
      content: opts.content,
      // A level the description asks for wins over the campaign's starting level.
      campaign: { startingLevel: (opts.levelFromText === false ? undefined : levelFromDescription(opts.description)) ?? opts.startingLevel },
      provider,
      onProgress: opts.onProgress,
    });
  } catch (err) {
    if (err instanceof EndpointError) return { error: err.error, message: err.message };
    if (err instanceof DescribeFailure) return { error: err.kind === "refused" ? "refused" : err.kind === "unavailable" ? "unavailable" : "api", message: err.message };
    throw err;
  }
}
