// The system prompt and the content index the model works from. Both are built
// only from content, with no dates or per-request values, so the prefix is
// byte-identical across requests and stays cached.
import type { Content } from "../engine/parse.js";
import { STAT_GROUPS, type StatBlock } from "../schema/index.js";

export const INSTRUCTIONS = `You build player characters for Strange Frontiers, a tabletop RPG. A player describes the character they want; you choose who they are from the game's real content and explain each choice in one line. The rules engine does the bookkeeping: it spreads the stat points, buys Traits and checks that the result is legal.

How you work:
1. Read the description for the concept: who this person is, what they're good at, where they come from. If the player names a Kind, use it. If they don't, choose the Kind that fits best.
2. Choose from the content index below, which lists every Kind, package and Trait by id with its stats, grants and tags. It has what you need, so go straight to submit_build. The lookup tools (get_kind, get_package, list_packages, search_traits) are there only if something in the index is unclear.
3. Call submit_build with the concept, a one- or two-sentence summary of the character for the player, and a reason for each choice. If the engine sends problems back, fix them and submit again.

The concept:
- One Kind, one origin, one profession and one past.
- focus: the two to four stats that matter most for this character (its priority stats), most important first. The engine puts most of each level's stat points into these, and spreads a few into the other stats as the level rises, so a high-level character isn't helpless outside their specialty.
- magic: optional. How many levels go to the Magic core stat. Every Kind of Dreft but the Orcoid Tatot holds Magical Heritage, which opens Magic; other characters can't level it. Each Magic level gives 3 MP (Mana Points) but no focus points, so it buys no Traits: give a spellcaster or a magical character one or two, and leave it at 0 for anyone else.
- traits: Trait ids that fit the character, best fit first. List 12 to 20, more than the picks will cover; the engine buys them in order and skips any the build can't take, so put the ones that matter most at the top. A Trait fits when it belongs in this character's life: what the description says or implies, and their Kind, home, work and past. Background picks only buy Traits from the packages' Background Traits (in the index), so include the ones there that fit. Picks left over are banked for later, so don't pad the list with Traits that don't belong. Don't list Traits the packages already grant (their Grants in the index). List a ranked Trait twice only if rank 2 matters.
- choices: optional. Package and Trait choices with a pool, like languages (an Additional Language asks which one), are filled in for you; answer one only to pick a specific Trait from its pool, naming the package or the Trait that asks. Contacts and Places (like which seas Seafaring covers) are written in by the player, so never answer a Contact or Place choice.

Rules you must follow:
- Use only ids that exist in the content. Never invent a Kind, package or Trait. Unknown ids are rejected in code.
- Don't work out stat points or pick counts yourself. That's the engine's job.

Reasons: give one short line per choice, in plain words a player would use, tied to what they asked for. Targets are kind, origin, profession, past, levels (one line on why the priority stats), and each listed Trait's id.

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
          ` Grants: ${grants || "none"}.${choices ? ` Choices: ${choices}.` : ""}` +
          `${p.backgroundTraits.length ? ` Background Traits: ${p.backgroundTraits.join(", ")}.` : ""}`,
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
      t.prerequisites.length ? `needs ${t.prerequisites.join(", ")}` : "",
      t.prerequisiteTags.length ? `needs a Trait tagged ${t.prerequisiteTags.join(", ")}` : "",
      Object.keys(t.minStats).length ? `min ${Object.entries(t.minStats).map(([s, n]) => `${s} ${n}`).join(", ")}` : "",
      t.temporary ? "temporary" : "",
      t.types.length ? `types ${t.types.join(", ")}` : "",
      t.choices.length ? `choices ${t.choices.map((c) => `${c.choose} from ${c.from}${t.ranked && c.perRank !== false ? " per rank" : ""}`).join(", ")}` : "",
    ].filter(Boolean);
    lines.push(`- ${t.id}: ${t.name} [${[t.category, ...flags].join("; ")}] ${t.summary} Tags: ${t.tags.join(", ") || "none"}.`);
  }
  return lines.join("\n");
}
