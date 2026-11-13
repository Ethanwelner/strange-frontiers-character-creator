import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadContent } from "../engine/content.js";
import { validateBuild } from "../engine/validate.js";
import { fromBuild } from "../app/draft.js";
import { applyTool, ask, sheetText, trackerLine } from "./chat.js";
import { addCondition, addItem, checkPlay, currentOf, hpConditions, maxOf, playBuild, playConditions, pointsToPlace, removeItem, shownResources, startPlay, withResource, withStartingCash } from "./play.js";
import type { CreateMessage } from "../ai/anthropic.js";

const { content } = loadContent();
// The example character's build alone, without what a player adds around
// it (looks, a description, a portrait, items, Conditions, a placed bonus
// point), so each test starts from a plain character
const EXTRAS = ["age", "gender", "customGender", "height", "weight", "description", "portrait", "items", "conditions", "startPoints"];
const example = JSON.parse(readFileSync(new URL("../../characters/grosh.json", import.meta.url), "utf8")) as Record<string, unknown>;
const grosh = Object.fromEntries(Object.entries(example).filter(([key]) => !EXTRAS.includes(key)));
const fresh = () => startPlay(grosh);
const validateBuildWithKit = (p: ReturnType<typeof fresh>) => validateBuild(playBuild(p), content, { startingLevel: p.draft.level });

describe("a character in play", () => {
  it("turns the Kit Points left at creation into starting cash, once", () => {
    const play = startPlay({ ...grosh, items: [] });
    const result = validateBuildWithKit(play);
    const left = result.summary!.kit;
    const cashed = withStartingCash(play, content);
    expect(cashed.draft.kitCashed).toBe(true);
    expect(cashed.draft.cash).toEqual({ [left.cash.currency]: left.cash.amount });
    // A second time, or after a round trip through a file, nothing more
    expect(withStartingCash(cashed, content)).toBe(cashed);
    expect(withStartingCash(startPlay(playBuild(cashed)), content).draft.cash).toEqual({ [left.cash.currency]: left.cash.amount });
    // Currency a file kept as items becomes cash
    const old = startPlay({ ...grosh, items: [{ item: "luras", name: "Luras", qty: 30, category: "currency" }, { item: "rope", name: "Rope", qty: 1 }] });
    expect(old.draft.cash).toEqual({ Luras: 30 });
    expect(old.items.map((i) => i.name)).toEqual(["Rope"]);
  });

  it("keeps an AI Core's HP on each chassis, so a chassis it left remembers its damage", () => {
    const chassis = (item: string, name: string, equipped: boolean) => ({ id: item, item, name, qty: 1, category: "chassis" as const, equipped });
    const swap = (p: ReturnType<typeof fresh>, to: string) => ({ ...p, items: p.items.map((i) => ({ ...i, equipped: i.item === to })) });
    let play = startPlay({ ...grosh, kind: "ai-core", items: [] });
    play = { ...play, items: [chassis("industrial-laborer-chassis", "Industrial Laborer Chassis", true), chassis("combat-walker-chassis", "Combat Walker Chassis", false)] };
    let result = checkPlay(play.draft, content, play.items);
    expect(maxOf(result, "hp")).toBe(22);
    expect(maxOf(result, "core")).toBe(10);
    play = withResource(play, result, "hp", 15);
    expect(play.current.hp).toBeUndefined();
    expect(play.items[0]!.hp).toBe(15);
    // In the Combat Walker: its own full 38
    play = swap(play, "combat-walker-chassis");
    result = checkPlay(play.draft, content, play.items);
    expect(currentOf(play, result, "hp")).toBe(38);
    play = withResource(play, result, "hp", 30);
    // Back in the Laborer: still 15, and the Walker keeps its 30
    play = swap(play, "industrial-laborer-chassis");
    result = checkPlay(play.draft, content, play.items);
    expect(currentOf(play, result, "hp")).toBe(15);
    expect(play.items[1]!.hp).toBe(30);
    // Back to full stores nothing
    expect(withResource(play, result, "hp", 22).items[0]!.hp).toBeUndefined();
    // Out of every chassis, it has its core's HP alone
    const bodiless = { ...play, items: play.items.map((i) => ({ ...i, equipped: false })) };
    expect(shownResources(checkPlay(bodiless.draft, content, bodiless.items))).toEqual(["vp", "sp", "core"]);
    expect(shownResources(result)).toEqual(["hp", "vp", "sp", "core"]);
  });

  it("checks the build at its own level, not a campaign's starting level", () => {
    const play = fresh();
    const result = checkPlay(play.draft, content);
    expect(result.errors.filter((e) => e.code === "level")).toEqual([]);
    expect(result.summary).toBeDefined();
  });

  it("starts full and lets resources go above the max", () => {
    const play = fresh();
    const result = checkPlay(play.draft, content);
    const max = maxOf(result, "hp");
    expect(currentOf(play, result, "hp")).toBe(max);
    const hurt = withResource(play, result, "hp", max - 3);
    expect(currentOf(hurt, result, "hp")).toBe(max - 3);
    expect(withResource(hurt, result, "hp", max).current.hp).toBeUndefined();
    expect(currentOf(withResource(hurt, result, "hp", max + 10), result, "hp")).toBe(max + 10);
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

  it("knows when stat points are left to place", () => {
    // Grosh hasn't placed Dreft's Physical bonus point.
    expect(pointsToPlace(fresh().draft, content)).toBe(true);
    const placed = { ...fresh().draft, startPoints: { endurance: 1 } };
    expect(pointsToPlace(placed, content)).toBe(false);
    // A level up leaves a core point and its focus points to place.
    const next = placed.level + 1;
    expect(pointsToPlace({ ...placed, level: next }, content)).toBe(true);
    expect(pointsToPlace({ ...placed, level: next, core: { ...placed.core, physical: placed.core.physical + 1 } }, content)).toBe(true);
  });

  it("stacks items by name and removes part of a stack", () => {
    let play = addItem(fresh(), { name: "Ration", qty: 2, category: "consumable", equipped: false });
    play = addItem(play, { name: "ration", qty: 1, category: "consumable", equipped: false });
    expect(play.items).toHaveLength(1);
    expect(play.items[0]!.qty).toBe(3);
    expect(removeItem(play, "Ration", 1).items[0]!.qty).toBe(2);
    expect(removeItem(play, "Ration").items).toHaveLength(0);
  });

  it("carries the build's items into play, and the play's items back out", () => {
    // Two of an item that isn't counted come in as two items
    const play = startPlay({ ...grosh, items: [{ name: "Rope", qty: 2, category: "gear" }, { name: "" }] });
    expect(play.items).toMatchObject([
      { name: "Rope", qty: 1, category: "gear", equipped: false },
      { name: "Rope", qty: 1, category: "gear", equipped: false },
    ]);
    expect(play.draft.items).toBeUndefined();
    const out = playBuild(addItem(play, { name: "Ration", qty: 3, category: "consumable", equipped: false }));
    expect((out.items as { name: string }[]).map((i) => i.name)).toEqual(["Rope", "Rope", "Ration"]);
    expect((out.items as { qty: number; units?: true }[])[2]).toMatchObject({ qty: 3, units: true });
    expect(checkPlay(fromBuild(out), content).errors.filter((e) => e.code === "schema")).toEqual([]);
    // No items, no items field.
    expect(playBuild(fresh())).not.toHaveProperty("items");
  });

  it("carries the build's Conditions into play, and the play's back out, like the items", () => {
    const plain = playConditions(content).find((t) => !t.ranked)!;
    const play = startPlay({ ...grosh, conditions: [{ trait: plain.id, rank: 1, note: "from the creator" }, { rank: 2 }] });
    expect(play.conditions).toEqual([{ trait: plain.id, rank: 1, note: "from the creator" }]);
    expect(play.draft.conditions).toBeUndefined();
    const out = playBuild(play);
    expect(out.conditions).toEqual([{ trait: plain.id, rank: 1, note: "from the creator" }]);
    expect(checkPlay(fromBuild(out), content).errors.filter((e) => e.code === "schema")).toEqual([]);
    // No Conditions, no conditions field, and the creator's draft keeps them.
    expect(playBuild(fresh())).not.toHaveProperty("conditions");
    expect(fromBuild(out).conditions).toEqual(play.conditions);
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
  it("changes several resources at once, by an amount or to a value, reporting before and after", () => {
    const play = fresh();
    const result = checkPlay(play.draft, content);
    const max = maxOf(result, "hp");
    const hit = applyTool("change_resources", { changes: [{ resource: "hp", by: -5 }, { resource: "vp", to: 1 }] }, play, result, content);
    expect(currentOf(hit.play, result, "hp")).toBe(max - 5);
    expect(currentOf(hit.play, result, "vp")).toBe(1);
    expect(hit.change).toBe(`HP ${max} → ${max - 5}; VP ${maxOf(result, "vp")} → 1`);
    expect((hit.result as { now: Record<string, { current: number }> }).now.hp!.current).toBe(max - 5);
  });

  it("changes nothing when one of the changes is bad", () => {
    const play = fresh();
    const result = checkPlay(play.draft, content);
    expect(() => applyTool("change_resources", { changes: [{ resource: "hp", by: -5 }, { resource: "xp", by: 1 }] }, play, result, content)).toThrow();
    expect(() => applyTool("change_resources", { changes: [{ resource: "hp" }] }, play, result, content)).toThrow();
  });

  it("reads the tracker's current values back from the play, not from anything said", () => {
    const play = { ...fresh(), current: { hp: 0 } };
    const result = checkPlay(play.draft, content);
    const state = applyTool("get_state", {}, play, result, content).result as { resources: Record<string, { current: number; max: number }>; hpConditions: string[] };
    expect(state.resources.hp).toEqual({ current: 0, max: maxOf(result, "hp") });
    expect(state.hpConditions).toEqual(["Dead"]);
    expect(trackerLine(play, result, content)).toMatch(new RegExp(`^HP 0/${maxOf(result, "hp")}, VP \\d+/\\d+, SP \\d+/\\d+; Dead$`));
  });

  it("weighs the equipped items against the carry weight, naming the encumbrance once it does something", () => {
    const base = fresh();
    const result = checkPlay(base.draft, content);
    const limit = 20 + 10 * (result.summary?.coreStats.physical ?? 0);
    const plate = { item: "plate-armor", name: "Plate Armor", qty: 1, category: "armor" as const, equipped: true };
    // Enough Plate Armor (25 kg each) to pass double the carry weight
    const stack = Math.floor((2 * limit) / 25) + 1;
    const heavy = { ...base, items: Array.from({ length: stack }, (_, n) => ({ ...plate, id: `p${n}` })) };
    const state = applyTool("get_state", {}, heavy, result, content).result as { carry: { load: number; limit: number; state: string } };
    expect(state.carry).toMatchObject({ load: 25 * stack, limit, state: "heavily-encumbered" });
    expect(trackerLine(heavy, result, content)).toContain("Heavily Encumbered");
    // Unequipped, it weighs nothing
    const stowed = { ...heavy, items: heavy.items.map((i) => ({ ...i, equipped: false })) };
    expect((applyTool("get_state", {}, stowed, result, content).result as { carry: { load: number } }).carry.load).toBe(0);
    expect(trackerLine(stowed, result, content)).not.toContain("Encumbered");
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
    expect(text).toContain("[vigilance]");
    expect(text).toMatch(/HP \d+\/\d+/);
  });

  it("gives the character's age and gender as cosmetic, and leaves them out when unset", () => {
    const play = fresh();
    const result = checkPlay(play.draft, content);
    expect(sheetText(play, result, content)).not.toMatch(/Age|Gender/);
    const set = { ...play, draft: { ...play.draft, age: 34, gender: "custom" as const, customGender: "Two-spirit" } };
    expect(sheetText(set, result, content)).toContain("Age 34, Gender Two-spirit (cosmetic, no rules effect)");
    const sized = { ...play, draft: { ...play.draft, height: "6′1″", weight: "85 kg" } };
    expect(sheetText(sized, result, content)).toContain("Height 6′1″, Weight 85 kg (cosmetic, no rules effect)");
  });

  it("runs tool calls until Claude answers, and reports what changed", async () => {
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "change_resources", input: { changes: [{ resource: "hp", by: -2 }] } }] },
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

  it("sends the tracker's current values with the player's message, and marks earlier changes as history", async () => {
    const sent: { messages: { role: string; content: unknown }[] }[] = [];
    const create = (async (params: unknown) => {
      sent.push(structuredClone(params) as (typeof sent)[number]);
      return { stop_reason: "end_turn", content: [{ type: "text", text: "Noted." }] };
    }) as unknown as CreateMessage;
    const play = { ...fresh(), current: { hp: 3 }, chat: [{ role: "user" as const, text: "I took 5" }, { role: "assistant" as const, text: "Done.", changes: ["HP 18 → 13"] }] };
    await ask({ message: "How am I?", play, check: (p) => checkPlay(p.draft, content), content, create, model: "claude-haiku-5-5" });
    const messages = sent[0]!.messages;
    expect(messages[1]!.content).toBe("Done.\n(Changed then: HP 18 → 13)");
    expect(messages[messages.length - 1]!.content).toMatch(/^How am I\?\n\n\(Tracker now: HP 3\/\d+,/);
  });
});
