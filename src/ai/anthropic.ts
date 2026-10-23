// The Claude API adapter (paid). The instructions and content index form a
// cached prefix; the conversation is cached as it grows.
import type Anthropic from "@anthropic-ai/sdk";
import { DescribeFailure, type ChatSession, type Prompt, type Provider, type ToolCall } from "./model.js";
import { TOOLS } from "./tools.js";

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.BetaMessage;

// The one call the adapter makes. The server passes the SDK's
// client.beta.messages.create; tests pass a fake.
export type CreateMessage = (params: Params) => Promise<Message>;

// The default; ANTHROPIC_MODEL in .env picks another, like claude-haiku-5-5.
export const CLAUDE_MODEL = "claude-opus-5-5";
// Server-side fallback: if a safety classifier declines, the API retries on
// the model Anthropic recommends for that category. Haiku has none.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const hasFallback = (model: string) => !model.startsWith("claude-haiku");

export function anthropicProvider(create: CreateMessage, maxTurns = 12, model = CLAUDE_MODEL): Provider {
  return { model, maxTurns, start: (prompt) => new AnthropicSession(create, prompt, model) };
}

class AnthropicSession implements ChatSession {
  private messages: Anthropic.Beta.BetaMessageParam[];
  private system: Anthropic.Beta.BetaTextBlockParam[];

  constructor(
    private create: CreateMessage,
    prompt: Prompt,
    private model: string,
  ) {
    this.system = [
      { type: "text", text: prompt.instructions },
      { type: "text", text: prompt.index, cache_control: { type: "ephemeral" } },
    ];
    this.messages = [{ role: "user", content: prompt.user }];
  }

  async send() {
    const response = await this.create({
      model: this.model,
      max_tokens: 16000,
      tools: TOOLS,
      system: this.system,
      messages: this.messages,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      // Caches the conversation so far, so each repair turn rereads it cheaply.
      cache_control: { type: "ephemeral" },
      ...(hasFallback(this.model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    });
    const u = response.usage;
    const usage = {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    };
    if (response.stop_reason === "refusal") {
      throw new DescribeFailure("refused", "Claude declined to build this character. Try describing it differently.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new DescribeFailure("truncated", "Claude's response was cut off before it finished the build.");
    }
    // Append the whole response, thinking blocks included, unchanged.
    this.messages.push({ role: "assistant", content: response.content });
    const calls: ToolCall[] = response.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));
    return { calls, usage };
  }

  addResults(results: { call: ToolCall; content: string; isError?: boolean }[]) {
    // All results for one turn go back in a single user message.
    this.messages.push({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.call.id,
        content: r.content,
        ...(r.isError ? { is_error: true } : {}),
      })),
    });
  }

  nudge(text: string) {
    this.messages.push({ role: "user", content: text });
  }
}
