# Plan

An AI-assisted character creator for Strange Frontiers. A player describes the character they want, and the creator assembles a legal character from the game's real content: Kind, Origin, Profession, Past, stats, Traits and starting equipment.

## Principles

- **The AI picks, the rules engine decides.** Claude reads the player's description and chooses from content in this repo. It never invents Traits or does stat math. A deterministic validator checks every build, and failures go back to Claude to repair.
- **Content grows forever.** Every Kind, package and Trait is its own file. Adding content means adding files, not changing code. The validator tells you what is missing or broken.
- **Start small.** Launch with what exists today: Human and the Dreft Kinds and packages.

## Where things live

| Surface | Role |
|---|---|
| **"Strange frontiers traits" Google Sheet** | Writing surface for all character creator content: a tab each for Kinds, Origins, Professions and Pasts, and one per Trait category (Knowledges, Languages, Skills, Abilities, Conditions, Circumstances, Other). One row per entry, in filterable tables. |
| **Campfire** | Writing surface for lore and the setting. It no longer holds character creator content (its Character Creator Content chapter was retired on 10/22/2026, after checking that everything in it was already here). |
| **This repo (`content/`)** | Source of truth for mechanics. Structured, validated, versioned in git. |
| **Strange Frontiers site (portfolio_site)** | Reader-facing front end for the rules. Over time its mechanics pages can be generated from this repo's data instead of hand-written HTML. |

Content flow: write in the Sheet → convert the new or changed rows to data files here (Claude-assisted, reviewed in a PR) → `npm run validate` → the site and the creator both read the result. Nothing syncs on its own: a change made in the Sheet isn't in the creator until it's brought in, and a change made here should go back to the Sheet so the two don't drift.

## Phases

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Foundation** | Repo, rules-data schema, validator, sample Kinds | Human and the Dreft Kinds validate |
| **1. Content** | Dreft Origins, Professions, Pasts; the Traits they grant; Edwin Humble's backgrounds | Every grant resolves to a real Trait file, and Edwin Humble can be expressed as data |
| **2. Rules engine** | Character model and `validateBuild(build)`, with tests | Illegal builds are rejected with readable reasons; a legal Dreft character per Kind passes |
| **3. Manual builder** | Click-to-build UI, no AI | A full character can be built and exported by hand |
| **4. AI layer** | Model with tools (`search_traits`, `get_package`, `submit_build`); the model submits a concept and the solver and engine build and check it | A set of sample prompts each produce legal, on-theme characters |
| **5. Playtest** | Private testing with your table; explanations and chat-based tweaks | Testers prefer it to building by hand |
| **6. Public** | Hosted on the site with rate limiting and cost controls | Ready for strangers |

## Decisions

- Repo is public on GitHub.
- Launch content: Human, Isek, Orcoid Tatot, Goblinoid Tatot, Guwain, the Dreft Origin, and the Dreftian Professions and Pasts.
- An Origin is a nation, not a hometown. Dreft grants Dreft (1), Dreftian Law (1) and Dreftan. Hometown knowledge (Port Herminst, Glintl, Seafaring, Farming and the rest) is on Dreft's Background Trait list, bought with picks.
- Public release waits until after playtesting.
- Content is YAML (easy to write by hand), checked by Zod schemas in TypeScript.
- Phase 2 tests skip Edwin Humble: the site's Human sample uses Earth packages that aren't in `content/` yet. He becomes a test once those packages are converted.

### Character creation

The rules `validateBuild` (in `src/engine/`) enforces:

1. Every stat starts at 0, and the Kind adds a bonus to each (`bonus` in a Kind's stats). A package can give free bonus points in one group (`bonusPoints`, like the American Empire's `{ count: 1, group: physical }`), which the player places in that group's focus stats; a group gets no more than the Kind's maximums leave room for, so an AI Core gets no Physical points. A Kind can also give free bonus points (`freePoints`; none does right now) that the player places in any stats, within the Kind's maximums; the build records them as `startPoints`, and they count toward the 9-point bonus budget. The bonus counts toward a stat's value like any other point: picks, requirements, resources and maximums all use the total.
2. Characters start at level 3 by default. The starting level is set per campaign, and a GM may start lower or higher; level 1 is the lowest.
3. Each level, including level 1 at creation, gives 1 core point in one group (physical, social or mental) and 3 focus points to spread among that group's three stats.
4. No focus stat may exceed its Kind max, and nothing may exceed 20. Traits and gear that push past that are out of scope for now.
5. On each stat's bar, odd points (1st, 3rd, 5th…) are circles and grant a universal Trait pick; even points are squares and grant a background Trait pick. A stat at value v gives ceil(v/2) universal and floor(v/2) background picks, which is why a Human, with a +1 bonus in all nine stats, starts with 9 universal picks.
6. Package grants are included automatically and don't use picks. Ranks granted by several packages don't stack. Each package `choices` entry must be answered with the right count. Traits can have `choices` too (Additional Contact, Additional Language): once the build holds the Trait, its choices must be answered the same way, once per rank for a ranked Trait, and an answer names the Trait instead of a package. A Trait's answer can't be a Trait the build already holds. Answers are checked against the pool when the pool can be resolved; otherwise the engine warns instead (see Choice pools below). A Contact isn't a Trait: the player decides who it is and records it in their own words, so any name answers a `contact` choice. An unrecorded Contact is a warning, not an error.
7. Background picks must come from the Background Trait list: the union of the packages' `backgroundTraits`, plus Traits tagged with one of the Kind's `traitAccess` pools. Universal picks can be any Trait not marked `background`. Few Traits carry those tags yet; tagging waits for the content fill that starts once the manual builder (Phase 3) exists.
8. Unspent picks are allowed and reported as banked, not as an error.
9. At creation only, universal picks may be spent on knowledge Traits. Starter-only Traits are allowed because this is creation.
   Background picks only take knowledge that's on the Background Trait list, even though the Traits page allows either pick. Fine for now. There's no cap on knowledge rank from creation picks beyond `rankStats`.
10. Conveyed Traits (`conveyed: true`, like Imperial Service Record) come only from packages, choices or play: no pick can buy one, and they never go on a Background Trait list, even through a Kind's Trait access. Prerequisites must be held, from any source. Non-ranked Traits can't be taken twice or above rank 1. Each pick buys one rank, in order; to rank a Trait above 1, each of its `rankStats` must be at least 3 × the rank.
11. HP is 10 plus each point in the Physical focus stats (Endurance, Power, Grace). VP is the total of the Social focus stats (Empathy, Persuasion, Demeanor) and SP the total of the Mental ones (Logic, Intuition, Memory). MP (Mana Points) is 3 per point of Magic. A Kind's `resources` add to them once (the Goblinoid Tatot's 6 MP), and a Trait's per rank held; gear is out of scope for now.
12. A Trait bought with a pick needs its `minStats`: focus stats by name (Power 3) and core stats by group (Physical 5), as the Traits page's stat requirements say. Its `prerequisiteTags` each need some other held Trait carrying that tag, which is how Expert Pilot's "any Pilot skill" works. Granted Traits skip both checks.
13. Magic is a fourth core stat with no focus stats: a Magic level spends no focus points and adds 3 MP instead, and gives no picks. A level can only go to Magic if the build holds a Trait whose `coreAccess` includes it. Magical Heritage does, and every Kind of Dreft but the Orcoid Tatot grants it (a Kind's `grants`, held like a package's).

## Open questions

- Trait categories and types: the full list (Knowledge, Skill, Contact, Starter, Condition, ...) needs pinning down as Traits are converted.
- Alternating levels: the Traits page says universal and background Traits alternate by level (odd levels universal, even levels background). This may be the circles-and-squares rule (Character creation, rule 5) said another way, so the engine doesn't enforce it separately. Confirm, then reword one of the two.
- Rank stats: no ranked Trait in content lists `rankStats` yet, so any Trait can be ranked up without a stat check. The site says, for example, that Pilot needs Grace and Memory. Each ranked Trait needs its stats filled in. The solver already adds those stats to a concept's focus when ranks above 1 are asked for.
- Items: needs its own schema once equipment rules settle.
- Choice pools (packages' and Traits'): `choices.from` names a pool that nothing in content defines. The engine maps `language` to Traits of type `language` and `dreftian-language` to language Traits with region `dreft` (only Dreftan so far). `contact` is free text, answered with whatever the player writes. Any other pool can't be checked, so answers to it only warn.
