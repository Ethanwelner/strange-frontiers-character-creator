// The Game Tools assistant: a chat about the character in play. Claude sees
// the character as the engine works it out, can look Traits up in the real
// content, and can change the tracker (HP, items, Conditions) when the
// player says something happened. The loop runs in the browser and sends
// each turn to the same kind of endpoint as the creator: the local AI
// server's /api/messages in development, the site's game-tools-api.php in a
// build, which adds the key and holds the model to Haiku.
import type Anthropic from "@anthropic-ai/sdk";
import type { CreateMessage } from "../ai/anthropic.js";
import { runTool, ToolError } from "../ai/tools.js";
import type { Content } from "../engine/parse.js";
import type { BuildResult } from "../engine/validate.js";
import { STAT_GROUPS, TraitCategory } from "../schema/index.js";
import {
  addCondition,
  addItem,
  currentOf,
  hpConditions,
  ITEM_CATEGORIES,
  maxOf,
  removeCondition,
  removeItem,
  RESOURCES,
  withResource,
  type ItemCategory,
  type Play,
  type ResourceKey,
} from "./play.js";

type Tool = Anthropic.Beta.BetaTool;
type MessageParam = Anthropic.Beta.BetaMessageParam;

// game-tools-api.php only accepts instructions that start this way.
export const INSTRUCTIONS_START = "You help a player run their Strange Frontiers character at the table.";

const INSTRUCTIONS = `${INSTRUCTIONS_START} Strange Frontiers is a tabletop RPG; the character's sheet, as the rules engine works it out, is below.

Numbers come from the tracker, never from memory:
- The tracker's current values come with each player message ("Tracker now: ..."), from get_state, and from the results of the tools that change it. Those are the only current numbers.
- Earlier messages are history. Any number in them, including "(Changed then: ...)" notes, may be out of date: never start a change or an answer from one.
- Before changing the tracker, check the values you're changing in the latest "Tracker now" or get_state. Make all of one message's resource changes in a single change_resources call.
- When you say what changed, use the before and after values the tool returned, exactly. If a value isn't what the player expects, say what the tracker shows rather than guessing.

How to help:
- Answer from the sheet and the game's content. Look Traits up with search_traits and get_trait rather than guessing what they do. If the rules don't say, say so, and that it's the GM's call.
- When the player says something happened to their character (they took damage, healed, spent VP, picked up or used an item, caught or shook off a Condition), change the tracker with the tools. Only change what they told you about. Damage comes off HP after resistances the player mentions; you don't know the character's armor unless it's in their items.
- Never level the character up or change their Traits or stats: the player does that on the page.
- Keep answers short: a sentence or two, or a short list. Say what you changed.
- Write plain text: the chat shows Markdown as typed, so no asterisks or other formatting.`;

const MAX_TURNS = 6;
// Earlier messages sent along with each new one.
const HISTORY = 20;

export const CHAT_TOOLS: Tool[] = [
  {
    name: "search_traits",
    description: "Search the game's Traits by words in their name, summary or tags, optionally within one category.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'Words to look for, e.g. "bleeding".' },
        category: { type: "string", enum: TraitCategory.options },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "get_trait",
    description: "A Trait's full entry by id: its effect, ranks, requirements and, for a temporary Condition, when it ends.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "get_state",
    description:
      "The tracker right now, read from it: current and max HP, VP, SP and MP, the HP Conditions, the temporary Conditions and the items. Call it before a change if you're not sure of a value.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "change_resources",
    description:
      "Change the character's current HP, VP, SP or MP, all of one message's changes in one call. Each change passes `by` to add or subtract (damage is negative) or `to` to set the value. Values stop at the max. Returns each value before and after, and the tracker's resources afterward.",
    input_schema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              resource: { type: "string", enum: [...RESOURCES] },
              by: { type: "integer" },
              to: { type: "integer" },
            },
            required: ["resource"],
          },
        },
      },
      required: ["changes"],
    },
  },
  {
    name: "add_item",
    description: "Add an item to the character's inventory. Items with the same name stack.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        qty: { type: "integer", minimum: 1 },
        category: { type: "string", enum: [...ITEM_CATEGORIES] },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "remove_item",
    description: "Remove an item, or some of a stack, from the inventory by name.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, qty: { type: "integer", minimum: 1 } },
      required: ["name"],
    },
  },
  {
    name: "add_condition",
    description:
      "Give the character a temporary Condition Trait by id, like severe-bleeding. A ranked Condition taken again goes up by `rank`. Healthy, Injured, Severely Injured, Incapacitated and Dead follow HP on their own.",
    input_schema: {
      type: "object",
      properties: { trait: { type: "string" }, rank: { type: "integer", minimum: 1 }, note: { type: "string" } },
      required: ["trait"],
    },
  },
  {
    name: "remove_condition",
    description: "Take a temporary Condition off the character, by Trait id.",
    input_schema: { type: "object", properties: { trait: { type: "string" } }, required: ["trait"] },
  },
];

const name = (content: Content, id: string) => content.traits.find((t) => t.id === id)?.name ?? id;

// The tracker as it stands, read from the play: what get_state returns.
export function stateOf(play: Play, result: BuildResult, content: Content) {
  const resources = Object.fromEntries(
    RESOURCES.filter((r) => r !== "mp" || maxOf(result, r) > 0).map((r) => [r, { current: currentOf(play, result, r), max: maxOf(result, r) }]),
  ) as Partial<Record<ResourceKey, { current: number; max: number }>>;
  return {
    level: play.draft.level,
    resources,
    hpConditions: hpConditions(currentOf(play, result, "hp"), maxOf(result, "hp")).map((id) => name(content, id)),
    conditions: play.conditions.map((c) => ({ id: c.trait, name: name(content, c.trait), rank: c.rank, ...(c.note ? { note: c.note } : {}) })),
    items: play.items.map((i) => ({ name: i.name, qty: i.qty, category: i.category, equipped: i.equipped, ...(i.notes ? { notes: i.notes } : {}) })),
  };
}

// The tracker in a line, like "HP 0/16, VP 2/2, SP 8/8, MP 2/6; Dead; Stimm Rush".
export function trackerLine(play: Play, result: BuildResult, content: Content): string {
  const s = stateOf(play, result, content);
  const res = Object.entries(s.resources).map(([r, v]) => `${r.toUpperCase()} ${v.current}/${v.max}`);
  return [res.join(", "), s.hpConditions.join(", "), ...s.conditions.map((c) => c.name + (c.rank > 1 ? ` (${c.rank})` : ""))].filter(Boolean).join("; ");
}

// The character as Claude sees it: the engine's numbers, what's on the
// tracker, and every held Trait's effect.
export function sheetText(play: Play, result: BuildResult, content: Content): string {
  const d = play.draft;
  const s = result.summary;
  const pkg = (id?: string) => content.packages.find((p) => p.id === id)?.name ?? id ?? "none";
  const kind = content.kinds.find((k) => k.id === d.kind);
  const lines = [
    `Name: ${d.name ?? "unnamed"}`,
    `Level ${d.level} ${kind?.name ?? d.kind ?? "no Kind"}; Origin ${pkg(d.origin)}, Profession ${pkg(d.profession)}, Past ${pkg(d.past)}`,
  ];
  if (kind?.features.length) lines.push(`Kind features: ${kind.features.map((f) => `${f.name}: ${f.description}`).join(" | ")}`);
  if (s) {
    lines.push(
      `Core stats: ${s.coreAccess.map((g) => `${g} ${s.coreStats[g]}`).join(", ")}`,
      `Focus stats: ${(Object.keys(STAT_GROUPS) as (keyof typeof STAT_GROUPS)[])
        .flatMap((g) => STAT_GROUPS[g].map((st) => `${st} ${s.stats[st]}`))
        .join(", ")}`,
      `Resources (current/max): ${RESOURCES.filter((r) => maxOf(result, r) > 0 || r !== "mp")
        .map((r) => `${r.toUpperCase()} ${currentOf(play, result, r)}/${maxOf(result, r)}`)
        .join(", ")}`,
      `Banked picks: ${s.picks.universal.banked} universal, ${s.picks.background.banked} background`,
      "Traits:",
      ...s.traits.map((h) => {
        const t = content.traits.find((x) => x.id === h.trait);
        return `- ${t?.name ?? h.trait} [${h.trait}]${t?.ranked ? ` rank ${h.rank}` : ""} (${t?.category ?? "unknown"}): ${t?.effect ?? ""}`;
      }),
    );
    const hp = hpConditions(currentOf(play, result, "hp"), maxOf(result, "hp"));
    lines.push(`HP Conditions: ${hp.map((id) => name(content, id)).join(", ")}`);
  } else {
    lines.push("The engine couldn't read this build, so its stats and Traits aren't known.");
  }
  lines.push(
    play.conditions.length
      ? `Temporary Conditions: ${play.conditions.map((c) => `${name(content, c.trait)} [${c.trait}]${c.rank > 1 ? ` rank ${c.rank}` : ""}${c.note ? ` (${c.note})` : ""}`).join(", ")}`
      : "Temporary Conditions: none",
    play.items.length
      ? `Items: ${play.items.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ""}${i.name} (${i.category}${i.equipped ? ", equipped" : ""}${i.notes ? `; ${i.notes}` : ""})`).join(", ")}`
      : "Items: none",
  );
  return lines.join("\n");
}

const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

interface Applied {
  play: Play;
  result: unknown;
  change?: string;
}

// One tool call against the character. Throws ToolError for bad input.
export function applyTool(
  tool: string,
  input: Record<string, unknown>,
  play: Play,
  result: BuildResult,
  content: Content,
): Applied {
  switch (tool) {
    case "search_traits":
      return { play, result: runTool("search_traits", { query: input.query, category: input.category, limit: input.limit }, content) };
    case "get_trait": {
      const t = content.traits.find((x) => x.id === str(input.id));
      if (!t) throw new ToolError(`No Trait "${String(input.id)}". Search for it with search_traits.`);
      return { play, result: t };
    }
    case "get_state":
      return { play, result: stateOf(play, result, content) };
    case "change_resources": {
      const asked = Array.isArray(input.changes) ? (input.changes as Record<string, unknown>[]) : [];
      if (!asked.length) throw new ToolError("Pass `changes`, a list of { resource, by } or { resource, to }.");
      // Checked before any change is made, so a bad one changes nothing.
      const steps = asked.map((c) => {
        const r = str(c?.resource) as ResourceKey | undefined;
        if (!r || !RESOURCES.includes(r)) throw new ToolError(`resource must be one of ${RESOURCES.join(", ")}`);
        const by = int(c.by);
        const to = int(c.to);
        if (by === undefined && to === undefined) throw new ToolError(`Pass by or to for ${r}.`);
        return { r, by, to };
      });
      let next = play;
      const changed = steps.map(({ r, by, to }) => {
        const before = currentOf(next, result, r);
        next = withResource(next, result, r, to ?? before + by!);
        return { resource: r, before, after: currentOf(next, result, r), max: maxOf(result, r) };
      });
      return {
        play: next,
        result: { changed, now: stateOf(next, result, content).resources },
        change: changed.map((c) => `${c.resource.toUpperCase()} ${c.before} → ${c.after}`).join("; "),
      };
    }
    case "add_item": {
      const itemName = str(input.name);
      if (!itemName) throw new ToolError("An item needs a name.");
      const category = (ITEM_CATEGORIES as readonly string[]).includes(String(input.category)) ? (input.category as ItemCategory) : "gear";
      const qty = Math.max(1, int(input.qty) ?? 1);
      const next = addItem(play, { name: itemName, qty, category, equipped: false, notes: str(input.notes) });
      return { play: next, result: { items: next.items }, change: `Added ${qty > 1 ? `${qty}× ` : ""}${itemName}` };
    }
    case "remove_item": {
      const itemName = str(input.name);
      const held = play.items.find((i) => i.name.toLowerCase() === itemName?.toLowerCase());
      if (!itemName || !held) throw new ToolError(`No item named "${String(input.name)}". Items: ${play.items.map((i) => i.name).join(", ") || "none"}`);
      const qty = int(input.qty);
      const next = removeItem(play, itemName, qty);
      return { play: next, result: { items: next.items }, change: `Removed ${qty && qty < held.qty ? `${qty}× ` : ""}${held.name}` };
    }
    case "add_condition": {
      const id = str(input.trait);
      const t = content.traits.find((x) => x.id === id && x.category === "condition");
      if (!t) throw new ToolError(`No Condition Trait "${String(input.trait)}". Search with category "condition".`);
      const next = addCondition(play, content, t.id, Math.max(1, int(input.rank) ?? 1), str(input.note));
      const held = next.conditions.find((c) => c.trait === t.id)!;
      return { play: next, result: { conditions: next.conditions }, change: `${t.name}${t.ranked ? ` (${held.rank})` : ""}` };
    }
    case "remove_condition": {
      const id = str(input.trait);
      if (!play.conditions.some((c) => c.trait === id)) throw new ToolError(`The character doesn't have "${String(input.trait)}".`);
      return { play: removeCondition(play, id!), result: { conditions: removeCondition(play, id!).conditions }, change: `No longer ${name(content, id!)}` };
    }
    default:
      throw new ToolError(`No tool named ${tool}.`);
  }
}

export interface ChatReply {
  play: Play;
  text: string;
  changes: string[];
}

// Answers one message from the player. `check` re-runs the engine on a
// changed play, so each tool sees the latest numbers.
export async function ask(opts: {
  message: string;
  play: Play;
  check: (play: Play) => BuildResult;
  content: Content;
  create: CreateMessage;
  model: string;
}): Promise<ChatReply> {
  let play = opts.play;
  const changes: string[] = [];
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: INSTRUCTIONS },
    { type: "text", text: `The character now:\n${sheetText(play, opts.check(play), opts.content)}` },
  ];
  // Earlier messages, as plain text, starting with the player's.
  const history = play.chat.slice(-HISTORY);
  while (history[0]?.role === "assistant") history.shift();
  // The tracker's current values ride on the player's message, so the
  // numbers Claude starts from are never the history's.
  const messages: MessageParam[] = [
    ...history.map((m): MessageParam => ({ role: m.role, content: m.changes?.length ? `${m.text}\n(Changed then: ${m.changes.join("; ")})` : m.text })),
    { role: "user", content: `${opts.message}\n\n(Tracker now: ${trackerLine(play, opts.check(play), opts.content)})` },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const reply = await opts.create({ model: opts.model, max_tokens: 2048, system, tools: CHAT_TOOLS, messages });
    messages.push({ role: "assistant", content: reply.content as MessageParam["content"] });
    const calls = reply.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (reply.stop_reason !== "tool_use" || calls.length === 0) {
      const text = reply.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { play, text: text || (changes.length ? "Done." : "I don't have an answer for that."), changes };
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = calls.map((call) => {
      try {
        const applied = applyTool(call.name, (call.input ?? {}) as Record<string, unknown>, play, opts.check(play), opts.content);
        play = applied.play;
        if (applied.change) changes.push(applied.change);
        return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(applied.result) };
      } catch (err) {
        if (!(err instanceof ToolError)) throw err;
        return { type: "tool_result", tool_use_id: call.id, content: err.message, is_error: true };
      }
    });
    messages.push({ role: "user", content: results });
  }
  return { play, text: changes.length ? "Done." : "That took too many steps. Try asking a smaller question.", changes };
}
