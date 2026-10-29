import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadContent } from "../engine/content.js";
import { applyTool, ask, sheetText } from "./chat.js";
import { addCondition, addItem, checkPlay, currentOf, hpConditions, maxOf, playConditions, removeItem, startPlay, withResource } from "./play.js";
import type { CreateMessage } from "../ai/anthropic.js";

const { content } = loadContent();
const grosh = JSON.parse(readFileSync(new URL("../../characters/grosh.json", import.meta.url), "utf8"));
const fresh = () => startPlay(grosh);

describe("a character in play", () => {
  it("checks the build at its own level, not a campaign's starting level", () => {
    const play = fresh();
    const result = checkPlay(play.draft, content);
    expect(result.errors.filter((e) => e.code === "level")).toEqual([]);
    expect(result.summary).toBeDefined();
  });

  it("starts full and keeps resources at or below the max", () => {
    const play = fresh();
    const result = checkPlay(play.draft, content);
    const max = maxOf(result, "hp");
    expect(currentOf(play, result, "hp")).toBe(max);
    const hurt = withResource(play, result, "hp", max - 3);
    expect(currentOf(hurt, result, "hp")).toBe(max - 3);
    expect(withResource(hurt, result, "hp", max + 10).current.hp).toBeUndefined();
    // HP can go below 0 (Dead is "0 or less"); the others stop at 0.
    expect(currentOf(withResource(play, result, "hp", -4), result, "hp")).toBe(-4);
    expect(currentOf(withResource(play, result, "vp", -4), result, "vp")).toBe(0);
  });

  it("follows HP with Healthy, Injured, Severely Injured, Incapacitated and Dead", () => {
    expect(hpConditions(20, 20)).toEqual(["healthy"]);
    expect(hpConditions(19, 20)).toEqual(["injured"]);
    expect(hpConditions(9, 20)).toEqual(["injured", "severely-injured"]);
    expect(hpConditions(4, 20)).toEqual(["injured", "severely-injured", "incapacitated"]);
    expect(hpConditions(0, 20)).toEqual(["dead"]);
  });

  it("offers temporary Conditions for characters only, without the HP ones", () => {
    const ids = playConditions(content).map((t) => t.id);
    expect(ids).not.toContain("injured");
    expect(ids).not.toContain("severely-injured");
    expect(ids).not.toContain("destroyed");
    expect(ids.length).toBeGreaterThan(0);
  });

  it("stacks items by name and removes part of a stack", () => {
    let play = addItem(fresh(), { name: "Ration", qty: 2, category: "consumable", equipped: false });
    play = addItem(play, { name: "ration", qty: 1, category: "consumable", equipped: false });
    expect(play.items).toHaveLength(1);
    expect(play.items[0]!.qty).toBe(3);
    expect(removeItem(play, "Ration", 1).items[0]!.qty).toBe(2);
    expect(removeItem(play, "Ration").items).toHaveLength(0);
  });

  it("raises a ranked Condition taken again, and ignores an unranked one", () => {
    const ranked = playConditions(content).find((t) => t.ranked);
    const plain = playConditions(content).find((t) => !t.ranked)!;
    let play = addCondition(addCondition(fresh(), content, plain.id), content, plain.id);
    expect(play.conditions).toEqual([{ trait: plain.id, rank: 1 }]);
    if (ranked) {
      play = addCondition(addCondition(play, content, ranked.id), content, ranked.id, 2);
      expect(play.conditions.find((c) => c.trait === ranked.id)!.rank).toBe(3);
    }
  });
});

describe("the assistant's tools", () => {
  it("changes resources by an amount or to a value", () => {
    const play = fresh();
    const result = checkPlay(play.draft, content);
    const max = maxOf(result, "hp");
    const hit = applyTool("change_resource", { resource: "hp", by: -5 }, play, result, content);
    expect(currentOf(hit.play, result, "hp")).toBe(max - 5);
    expect(hit.change).toBe(`HP ${max} → ${max - 5}`);
    expect(() => applyTool("change_resource", { resource: "xp", by: 1 }, play, result, content)).toThrow();
  });

  it("refuses Conditions that aren't Condition Traits", () => {
    const play = fresh();
    const result = checkPlay(play.draft, content);
    expect(() => applyTool("add_condition", { trait: "streetwise" }, play, result, content)).toThrow(/Condition/);
  });

  it("describes the character with its Traits' effects", () => {
    const play = fresh();
    const text = sheetText(play, checkPlay(play.draft, content), content);
    expect(text).toContain("Name: Grosh");
    expect(text).toContain("[streetwise]");
    expect(text).toMatch(/HP \d+\/\d+/);
  });

  it("runs tool calls until Claude answers, and reports what changed", async () => {
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "change_resource", input: { resource: "hp", by: -2 } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Ouch. HP down 2." }] },
    ];
    const sent: unknown[] = [];
    const create = (async (params: unknown) => {
      sent.push(params);
      return replies.shift();
    }) as unknown as CreateMessage;
    const play = fresh();
    const out = await ask({ message: "I took 2 damage", play, check: (p) => checkPlay(p.draft, content), content, create, model: "claude-haiku-5-5" });
    expect(out.text).toBe("Ouch. HP down 2.");
    expect(out.changes).toHaveLength(1);
    expect(out.play.current.hp).toBe(maxOf(checkPlay(play.draft, content), "hp") - 2);
    expect((sent[0] as { system: { text: string }[] }).system[0]!.text).toMatch(/^You help a player run their Strange Frontiers character at the table\./);
  });
});
