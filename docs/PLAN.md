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
| **2. Rules engine** | Character model and `validateBuild(build)`, with tests | Illegal builds are rejected with readable reasons; Edwin passes |
| **3. Manual builder** | Click-to-build UI, no AI | A full character can be built and exported by hand |
| **4. AI layer** | Claude API with tools (`search_traits`, `get_package`, `validate_build`) and the describe → build → repair loop | A set of sample prompts each produce legal, on-theme characters |
| **5. Playtest** | Private testing with your table; explanations and chat-based tweaks | Testers prefer it to building by hand |
| **6. Public** | Hosted on the site with rate limiting and cost controls | Ready for strangers |

## Decisions

- Repo is public on GitHub.
- Launch content: Human, Isek, Tatot, Guwain, and the Dreftian Origins, Professions and Pasts.
- Public release waits until after playtesting.
- Content is YAML (easy to write by hand), checked by Zod schemas in TypeScript.

## Open questions

- Trait categories and types: the full list (Knowledge, Skill, Contact, Starter, Condition, ...) needs pinning down as Traits are converted.
- Universal feat picks at creation: how many, and which pools, per Kind and level.
- Whether characters start at level 1 or 2–3, as the sample sheet suggests.
- Items: needs its own schema once equipment rules settle.
