# Plan

An AI-assisted character creator for Strange Frontiers. A player describes the character they want, and the creator assembles a legal character from the game's real content: Kind, Origin, Profession, Past, stats, Traits and starting equipment.

## Principles

- **The AI picks, the rules engine decides.** Claude reads the player's description and chooses from content in this repo. It never invents Traits or does stat math. A deterministic validator checks every build, and failures go back to Claude to repair.
- **Content grows forever.** Every Kind, package and Trait is its own file. Adding content means adding files, not changing code. The validator tells you what is missing or broken.
- **Start small.** Launch with what exists today: Human and the Dreft Kinds and packages.

## Where things live

| Surface | Role |
|---|---|
| **Campfire** | Writing surface. Lore and first drafts of mechanics get written here. |
| **This repo (`content/`)** | Source of truth for mechanics. Structured, validated, versioned in git. |
| **Strange Frontiers site (portfolio_site)** | Reader-facing front end for the rules. Over time its mechanics pages can be generated from this repo's data instead of hand-written HTML. |

Content flow: write in Campfire → convert to data files here (Claude-assisted, reviewed in a PR) → `npm run validate` → the site and the creator both read the result.

## Phases

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Foundation** | Repo, rules-data schema, validator, sample Kinds | Human and the Dreft Kinds validate |
| **1. Content** | Dreft Origins, Professions, Pasts; the Traits they grant; Edwin Humble's backgrounds | Every grant resolves to a real Trait file, and Edwin Humble can be expressed as data |
| **2. Rules engine** | Character model and `validateBuild(build)`, with tests | Illegal builds are rejected with readable reasons; a legal Dreft character per Kind passes |
| **3. Manual builder** | Click-to-build UI, no AI | A full character can be built and exported by hand |
| **4. AI layer** | Claude API with tools (`search_traits`, `get_package`, `validate_build`) and the describe → build → repair loop | A set of sample prompts each produce legal, on-theme characters |
| **5. Playtest** | Private testing with your table; explanations and chat-based tweaks | Testers prefer it to building by hand |
| **6. Public** | Hosted on the site with rate limiting and cost controls | Ready for strangers |

## Decisions

- Repo is public on GitHub.
- Launch content: Human, Isek, Tatot, Guwain, and the Dreftian Origins, Professions and Pasts.
- Public release waits until after playtesting.
- Content is YAML (easy to write by hand), checked by Zod schemas in TypeScript.
- Phase 2 tests skip Edwin Humble: the site's Human sample uses Earth packages that aren't in `content/` yet. He becomes a test once those packages are converted.

### Character creation

The rules `validateBuild` (in `src/engine/`) enforces:

1. Level 0 stats come from the Kind, or the chosen form for a Kind with forms.
2. Characters start at level 1 by default. The starting level is set per campaign (a GM may start at 2–3).
3. Each level, including level 1 at creation, gives 1 Inner Ring point in one group (physical, social or mental) and 3 Outer Ring points to spread among that group's three stats.
4. No Outer Ring stat may exceed its Kind max, and nothing may exceed 20. Traits and gear that push past that are out of scope for now.
5. On each stat's bar, odd points (1st, 3rd, 5th…) are circles and grant a universal feat pick; even points are squares and grant a background feat pick. A stat at value v gives ceil(v/2) universal and floor(v/2) background picks, which is why a Human, with 1 in all nine stats, starts with 9 universal picks.
6. Package grants are included automatically and don't use picks. Ranks granted by several packages don't stack. Each package `choices` entry must be answered with the right count. Answers are checked against the pool when the pool can be resolved; otherwise the engine warns instead (see Choice pools below).
7. Background picks must come from the Background Trait list: the union of the packages' `backgroundTraits`, plus Traits tagged with one of the Kind's `featAccess` pools. Universal picks can be any Trait not marked `background`.
8. Unspent picks are allowed and reported as banked, not as an error.
9. At creation only, universal picks may be spent on knowledge Traits. Starter-only Traits are allowed because this is creation.
10. Prerequisites must be held, from any source. Non-ranked Traits can't be taken twice or above rank 1. Each pick buys one rank, in order; to rank a Trait above 1, each of its `rankStats` must be at least 3 × the rank.

## Open questions

- Trait categories and types: the full list (Knowledge, Skill, Contact, Starter, Condition, ...) needs pinning down as Traits are converted.
- Alternating levels: the Traits page says universal and background Traits alternate by level (odd levels universal, even levels background). This may be the circles-and-squares rule (Character creation, rule 5) said another way, so the engine doesn't enforce it separately. Confirm, then reword one of the two.
- Knowledge with background picks: the Traits page says players can spend universal *or* background picks on knowledge at creation. The engine only lets background picks take knowledge on the Background Trait list. Decide whether background picks get the same allowance.
- How high a knowledge rank creation picks can reach is up to the GM on the site; the engine has no limit beyond `rankStats`.
- `featAccess` matching: the engine matches a Kind's `featAccess` pools against Trait tags. No Trait is tagged `guild`, `trading-guild` or `merchant-clan` yet, so Isek and Tatot get little from it today.
- Items: needs its own schema once equipment rules settle.
- Choice pools: `choices.from` names a pool (`contact`, `language`, `dreftian-language`) that nothing defines yet. The engine maps `contact` to the `contact` category and `language` to the `language` type. No Contacts or Dreftian languages exist yet, so answers to those pools only warn.
