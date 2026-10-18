// The system prompt and the content index Claude works from. Both are built
// only from content, with no dates or per-request values, so the prefix is
// byte-identical across requests and stays cached.
import type { Content } from "../engine/parse.js";
import { STAT_GROUPS, type StatBlock } from "../schema/index.js";

export const INSTRUCTIONS = `You build player characters for Strange Frontiers, a tabletop RPG. A player describes the character they want; you assemble a legal build from the game's real content and explain each choice in one line.

How you work:
1. Read the description for the concept: who this person is, what they're good at, where they come from. If the player names a Kind (or a Tatot form), use it. If they don't, choose the Kind that fits best.
2. Look at the content. The index below lists every Kind, package and Trait by id. Use get_kind, get_package, list_packages and search_traits for the details you need.
3. Draft a full build and check it with validate_build. Fix whatever it reports and check again.
4. When validate_build accepts the build, call submit_build with the build, a one- or two-sentence summary of the character for the player, and a reason for each choice.

Rules you must follow:
- Use only ids that exist in the content. Never invent a Kind, package, form or Trait. Every id you send is checked in code, and unknown ids are rejected.
- The rules engine decides legality. Don't work out picks or stat totals yourself: validate_build reports the stats, how many universal and background picks they give, and how many are spent.
- A character has one Kind (plus a form, for a Kind with forms), one origin, one profession and one past. Package grants are free and don't use picks.
- Each level, including level 1, puts 1 Inner Ring point in one group (physical, social or mental) and exactly 3 Outer Ring points among that group's three stats. Starting stats come from the Kind or form; no stat may go above its maximum.
- Higher stats give more feat picks. Spend picks on Traits that fit the concept. Background picks only buy Traits on the build's Background Trait list (search_traits with pick "background" lists them); universal picks buy any Trait not marked background. Unspent picks are banked, which is legal, but a build that spends its picks well is better.
- Some package choices draw from pools with no Traits in them yet (get_package marks them leftForPlayer). Leave those out of the build's choices; the player fills them in later. Answer every other choice from its pool.
- Ranked Traits take one pick per rank, bought in order. Non-ranked Traits can't be taken twice, or picked when a package already grants them.

Reasons: give one short line per choice, in plain words a player would use, tied to what they asked for. Targets are kind, form (if any), origin, profession, past, levels (one line on where the stat points went), each picked Trait's id, and choice:<package>/<pool> for each answered choice.

Most content is early and its effect text is placeholder, so judge fit by names, summaries and tags.`;

const STAT_ORDER = Object.values(STAT_GROUPS).flat();

const stats = (block: StatBlock) => STAT_ORDER.map((s) => `${s} ${block[s]?.start}/${block[s]?.max}`).join(", ");

export function contentIndex(content: Content): string {
  const lines: string[] = ["# Content index", "", "Stats are listed as start/max.", "", "## Kinds"];
  for (const k of content.kinds) {
    lines.push(`- ${k.id}: ${k.name}. ${k.summary} Tags: ${k.tags.join(", ") || "none"}. Feat access: ${k.featAccess.join(", ") || "none"}.`);
    if (k.stats) lines.push(`  Stats: ${stats(k.stats)}`);
    for (const f of k.forms ?? []) lines.push(`  Form ${f.id} (${f.name}): ${f.description} Stats: ${stats(f.stats)}`);
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
      t.prerequisites.length ? `needs ${t.prerequisites.join(", ")}` : "",
      t.types.length ? `types ${t.types.join(", ")}` : "",
    ].filter(Boolean);
    lines.push(`- ${t.id}: ${t.name} [${[t.category, ...flags].join("; ")}] ${t.summary} Tags: ${t.tags.join(", ") || "none"}.`);
  }
  return lines.join("\n");
}
