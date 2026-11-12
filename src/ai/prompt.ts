// The system prompt and the content index the model works from. Both are built
// only from content, with no dates or per-request values, so the prefix is
// byte-identical across requests and stays cached.
import type { Content } from "../engine/parse.js";
import { attackText, damageText } from "../engine/damage.js";
import { kitCostOf } from "../engine/wealth.js";
import { STAT_GROUPS, type StatBlock } from "../schema/index.js";

export const INSTRUCTIONS = `You build player characters for Strange Frontiers, a tabletop RPG. A player describes the character they want; you choose who they are from the game's real content and explain each choice in one line. The rules engine does the bookkeeping: it spreads the stat points, buys Traits and checks that the result is legal.

How you work:
1. Read the description for the concept: who this person is, what they're good at, where they come from. If the player names a Kind, use it. If they don't, choose the Kind that fits best.
2. Choose from the content index below, which lists every Kind, package, Trait and item by id with its stats, grants and tags. It has what you need, so go straight to submit_build. The lookup tools (get_kind, get_package, list_packages, search_traits) are there only if something in the index is unclear.
3. Call submit_build with the concept, a one- or two-sentence summary of the character for the player, and a reason for each choice. If the engine sends problems back, fix them and submit again.

The concept:
- name: the character's name. Use the player's if they gave one; otherwise make one up that fits the character's Kind, home and past, following the Naming notes on its Kind and Origin. Every character gets a name.
- One Kind, one origin, one profession and one past.
- focus: the two to four stats that matter most for this character (its priority stats), most important first. The engine puts most of each level's stat points into these, and spreads a few into the other stats as the level rises, so a high-level character isn't helpless outside their specialty.
- magic: optional. How many levels go to the Magic core stat. Only a character holding a Trait that opens Magic can level it: Magic Access, which every Kind of Dreft but the Orcoid Tatot gets through its Magical Heritage. Each Magic level gives 3 MP (Mana Points) but no focus points, so it buys no Traits: give a spellcaster or a magical character one or two, and leave it at 0 for anyone else.
- traits: Trait ids that fit the character, best fit first. List 12 to 20, more than the picks will cover; the engine buys them in order and skips any the build can't take, so put the ones that matter most at the top. A Trait fits when it belongs in this character's life: what the description says or implies, and their Kind, home, work and past. Background picks only buy Traits from the packages' Background Traits (in the index), so include the ones there that fit. Picks left over are banked for later, so don't pad the list with Traits that don't belong. Don't list Traits the packages already grant (their Grants in the index). List a ranked Trait twice only if rank 2 matters.
- items: item ids the character starts with, from the Items in the index, most needed first. Pick what this person would really carry: a weapon and armor if they fight (matching their weapon skills), the kits and tools of their trade and Traits, travel or survival gear if they live on the road, ammunition for a bow or gun. About 3 to 8; a scholar may carry little, a soldier more. Only items from the character's own plane (their origin's: Earth or Isekai) or any plane: a character from Dreft doesn't start with an Earth pistol. Money isn't handed out yet, so leave currency out. List an item twice to carry two.
- Starting items are bought with Wealth. The character's Wealth is the sum of the Wealth its origin, profession, past and Traits list in the index (0 when none is listed). Each item lists its Kit Cost ("kit N"). The items' Kit Costs add up to no more than 3 + 2 × Wealth, and no one item can cost more than Wealth + 1. Kit 0 items cost nothing. An AI Core's chassis is free up to kit 3. A poor character (Wealth -1 or 0) starts with cheap gear: leave out a weapon they can't afford, even one they're skilled with, and pick the kit 0 items that fit instead.
- choices: optional. Package and Trait choices with a pool, like a package's "+1 Language", are filled in for you; answer one only to pick a specific Trait from its pool, naming the package or the Trait that asks. Contacts, Places (like which seas Seafaring covers) and a Hunter's Quarry are written in by the player, so never answer a Contact, Place or Quarry choice.

Rules you must follow:
- Use only ids that exist in the content. Never invent a Kind, package, Trait or item. Unknown ids are rejected in code.
- Don't work out stat points or pick counts yourself. That's the engine's job.
- A Trait on a list (marked "magic list" in the index) can only be taken by a character holding a Trait that opens that list (marked "opens the magic list", like Magic Access, which most Kinds of Dreft get through their Magical Heritage; a Trait that grants an opener counts too). Don't list them for anyone else.

Reasons: give one short line per choice, in plain words a player would use, tied to what they asked for. Targets are kind, origin, profession, past, levels (one line on why the priority stats), each listed Trait's id, and item:<id> for each item.

Most content is early and its effect text is placeholder, so judge fit by names, summaries and tags.`;

const STAT_ORDER = Object.values(STAT_GROUPS).flat();

const stats = (block: StatBlock) => STAT_ORDER.map((s) => `${s} ${block[s]?.bonus}/${block[s]?.max}`).join(", ");

export function contentIndex(content: Content): string {
  const lines: string[] = ["# Content index", "", "Stats are listed as Kind bonus/max. Every stat starts at 0 and the Kind adds its bonus.", "", "## Kinds"];
  for (const k of content.kinds) {
    const grants = k.grants.map((g) => g.trait).join(", ");
    const resources = Object.entries(k.resources).map(([r, n]) => `+${n} ${r.toUpperCase()}`).join(", ");
    lines.push(
      `- ${k.id}: ${k.name}. ${k.summary} Tags: ${k.tags.join(", ") || "none"}. Trait access: ${k.traitAccess.join(", ") || "none"}.` +
        `${k.naming ? ` Naming: ${k.naming}` : ""}` +
        `${grants ? ` Grants: ${grants}.` : ""}${resources ? ` Resources: ${resources}.` : ""}`,
    );
    lines.push(`  Stats: ${stats(k.stats)}${k.freePoints ? `. Plus ${k.freePoints} free bonus points, placed by the engine` : ""}`);
  }
  for (const type of ["origin", "profession", "past"] as const) {
    lines.push("", `## ${type[0]!.toUpperCase()}${type.slice(1)}s`);
    for (const p of content.packages.filter((x) => x.type === type)) {
      const grants = p.grants.map((g) => (g.rank ? `${g.trait} ${g.rank}` : g.trait)).join(", ");
      const choices = p.choices.map((c) => `${c.choose} from ${c.from}`).join(", ");
      lines.push(
        `- ${p.id}: ${p.name}${p.region ? ` (${p.region})` : ""}. ${p.summary} Tags: ${p.tags.join(", ") || "none"}.` +
          `${p.naming ? ` Naming: ${p.naming}` : ""}` +
          `${p.wealth ? ` Wealth ${p.wealth > 0 ? "+" : ""}${p.wealth}.` : ""}` +
          ` Grants: ${grants || "none"}.${choices ? ` Choices: ${choices}.` : ""}` +
          `${p.bonusPoints.length ? ` Bonus points (placed by the engine): ${p.bonusPoints.map((b) => `${b.count} ${b.group}`).join(", ")}.` : ""}` +
          `${Object.keys(p.coreBonus).length ? ` Core bonus: ${Object.entries(p.coreBonus).map(([g, n]) => `+${n} ${g}`).join(", ")} (if the character can level it).` : ""}` +
          `${p.backgroundKeywords.length ? ` Background Keywords: ${p.backgroundKeywords.join(", ")}.` : ""}`,
      );
    }
  }
  lines.push("", "## Traits", "Format: id: name [category; flags] summary");
  for (const t of content.traits) {
    const flags = [
      t.ranked ? `ranked by ${t.rankStats.join("+") || "nothing"}` : "",
      t.background ? "background" : "",
      t.starterOnly ? "starter only" : "",
      t.conveyed ? "conveyed, packages only" : "",
      t.list ? `${t.list} list` : "",
      t.grants.length ? `grants ${t.grants.map((g) => g.trait).join(", ")}` : "",
      t.prerequisites.length ? `needs ${t.prerequisites.join(", ")}` : "",
      t.prerequisiteTags.length ? `needs a Trait tagged ${t.prerequisiteTags.join(", ")}` : "",
      Object.keys(t.minStats).length ? `min ${Object.entries(t.minStats).map(([s, n]) => `${s} ${n}`).join(", ")}` : "",
      t.temporary ? "temporary" : "",
      t.wealth ? `wealth ${t.wealth > 0 ? "+" : ""}${t.wealth}${t.ranked ? " per rank" : ""}` : "",
      t.types.length ? `types ${t.types.join(", ")}` : "",
      t.choices.length ? `choices ${t.choices.map((c) => `${c.choose} from ${c.from}${t.ranked && c.perRank !== false ? " per rank" : ""}`).join(", ")}` : "",
    ].filter(Boolean);
    lines.push(`- ${t.id}: ${t.name} [${[t.category, ...flags].join("; ")}] ${t.summary} Tags: ${t.tags.join(", ") || "none"}.`);
  }
  lines.push("", "## Items", "Format: id: name [category; plane; kit cost; slot; damage, attack, resistances or modifiers] summary. Any-plane items suit everyone.");
  for (const i of content.items) {
    if (i.category === "currency") continue;
    const flags = [
      i.category,
      i.plane,
      `kit ${kitCostOf(i)}`,
      i.slot ? `slot ${i.slot}` : "",
      i.damage ? `damage ${damageText(i.damage)}` : "",
      attackText(i),
      i.resistances ? `resists ${i.resistances}` : "",
      i.modifiers ?? "",
      i.uses ?? "",
    ].filter(Boolean);
    lines.push(`- ${i.id}: ${i.name} [${flags.join("; ")}] ${i.summary} Tags: ${i.tags.join(", ") || "none"}.`);
  }
  return lines.join("\n");
}
