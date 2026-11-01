import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadContent } from "../engine/content.js";
import type { CreateMessage } from "../ai/anthropic.js";
import { applyTool, ask } from "./chat.js";
import { facing, icosahedron, roll, rotate } from "./dice.js";
import { checkPlay, startPlay } from "./play.js";

const { content } = loadContent();
const grosh = JSON.parse(readFileSync(new URL("../../characters/grosh.json", import.meta.url), "utf8"));

describe("the d20", () => {
  it("has 20 faces numbered 1 to 20, opposite faces adding up to 21", () => {
    const { faces } = icosahedron();
    expect(faces.map((f) => f.number).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const f of faces) {
      const opposite = faces.find((g) => g.normal.every((x, i) => Math.abs(x + f.normal[i]!) < 1e-6))!;
      expect(f.number + opposite.number).toBe(21);
    }
  });

  it("lands with the rolled face turned toward you", () => {
    const { faces } = icosahedron();
    for (const f of faces) {
      const z = rotate(facing(f), f.normal)[2];
      const others = faces.filter((g) => g !== f).map((g) => rotate(facing(f), g.normal)[2]);
      expect(z).toBeGreaterThan(Math.max(...others));
    }
  });

  it("lands with the rolled face's number reading upright", () => {
    for (const f of icosahedron().faces) {
      const up = rotate(facing(f), f.up);
      expect(up[1]).toBeGreaterThan(0.9);
      expect(Math.abs(up[0])).toBeLessThan(1e-6);
    }
  });

  it("rolls whole numbers from 1 to 20", () => {
    const rolls = Array.from({ length: 2000 }, () => roll(20));
    expect(Math.min(...rolls)).toBe(1);
    expect(Math.max(...rolls)).toBe(20);
    expect(rolls.every(Number.isInteger)).toBe(true);
  });
});

describe("the assistant's rolls", () => {
  it("rolls with a modifier and says what it rolled", () => {
    const play = startPlay(grosh);
    const out = applyTool("roll_d20", { count: 2, modifier: 3, for: "Shoot" }, play, checkPlay(play.draft, content), content);
    expect(out.play).toBe(play);
    expect(out.rolls).toHaveLength(2);
    const [a, b] = out.rolls!;
    expect(out.change).toBe(`Rolled 2 d20s for Shoot: ${a} + 3 = ${a! + 3}, ${b} + 3 = ${b! + 3}`);
  });

  it("joins the player's rolls on the page into one message with what they say next", async () => {
    const sent: { messages: { role: string; content: unknown }[] }[] = [];
    const create = (async (params: unknown) => {
      sent.push(structuredClone(params) as (typeof sent)[number]);
      return { stop_reason: "end_turn", content: [{ type: "text", text: "A 14 beats a 12." }] };
    }) as unknown as CreateMessage;
    const play = { ...startPlay(grosh), chat: [{ role: "user" as const, text: "Rolled a d20: 14" }] };
    await ask({ message: "Did that beat 12?", play, check: (p) => checkPlay(p.draft, content), content, create, model: "claude-haiku-5-5" });
    const messages = sent[0]!.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toMatch(/^Rolled a d20: 14\n\nDid that beat 12\?/);
  });
});
