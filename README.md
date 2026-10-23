# Strange Frontiers Character Creator

Describe the character you want to play, and get a legal Strange Frontiers character built from the game's real Kinds, backgrounds, Traits and equipment.

Early work in progress. See [docs/PLAN.md](docs/PLAN.md) for the roadmap and [docs/CONTENT.md](docs/CONTENT.md) for how to add content.

## Setup

Needs Node 24 or newer (`.nvmrc` pins it, so `nvm use` picks it up), and the [portfolio_site](https://github.com/Ethanwelner/portfolio_site) repo checked out beside this one: the builder wears the Strange Frontiers site's CSS, and `npm run dev` serves it from there (set `SF_SITE_DIR` in `.env` if the site lives elsewhere).

```bash
nvm use
npm install
npm run validate
npm test
```

**Build it** uses a local model through [Ollama](https://ollama.com), so it's free and nothing leaves your machine:

1. Install Ollama and open it.
2. Pull the model: `ollama pull qwen3:30b-a3b` (about 19 GB; it needs a Mac with plenty of memory).
3. Optional: copy `.env.example` to `.env` to pick another model (`OLLAMA_MODEL`; `OLLAMA_MODE=json` for models that don't call tools well) or switch to the paid Claude API (`SF_PROVIDER=anthropic` plus `ANTHROPIC_API_KEY`; `ANTHROPIC_MODEL` picks the model, Claude Haiku 5.5 by default). Restart `npm run dev` after editing `.env`.

`.env` is gitignored. The API key is read only by the local AI server; it never reaches the browser and is never logged.

## Building characters with Claude Code

Claude Code can also build characters in chat, without the app's AI layer. The loop is the same one the app runs: Claude reads the description, picks only from `content/`, and the engine checks the build.

1. In Claude Code, describe the character and ask for a build, e.g. "Build a character: a goblin hedge witch from a farming village."
2. Claude writes a `Build` JSON file to `characters/` and checks it:

   ```bash
   npm run check-build -- characters/grosh.json
   ```

   This runs the same checks as the AI layer: unknown ids first, then `validateBuild`. It prints errors, warnings, stats, picks and held Traits, and exits non-zero unless the build is legal. It checks against the build's own level; add `--level N` to check against a campaign's starting level instead.
3. Claude fixes anything the check reports and runs it again until the build is legal.
4. In the builder, **Import** the file. From there it's editable like any build, and Contacts get recorded on the Choices step.

`characters/grosh.json` is an example.

## Describe your character (AI)

Type a description in plain words and press **Build it** (Phase 4). The model reads the description and submits a concept: the Kind, the three packages, the stats that matter most, and a list of fitting Traits, best first. The solver (`src/engine/solve.ts`) turns that into a full build: it spreads each level's stat points into the focus stats, answers language-style choices, buys Traits from the list in order and skips any the engine rejects, then spends leftover background picks on the Background Trait list. The engine checks the result in the same step; if something's wrong (an unknown Kind or package), the problems go back to the model. Most builds take one or two turns. The build fills the builder with a one-line reason per choice, and stays fully editable, with live validation, afterward.

- The model never invents content or does the stat math. Unknown Kinds and packages are rejected in code, unknown Traits are skipped, and every build goes through `validateBuild`, so even a small local model can't produce an illegal character. How well the character fits the description does depend on the model.
- If the Trait list runs out with more than two picks unspent, the model is asked once for more Traits. Local models reason before their first submit and skip reasoning on repairs, which keeps those turns short.
- It never names a Contact: who it is is up to you, and you write it on the Choices step. Until you do, the build is still legal and the panel shows a reminder. Dreftian-language choices pick from the Dreftian languages in content (Dreftan for now).
- Models: local Ollama by default (`qwen3:30b-a3b` with tool calling, up to 20 turns; `qwen3:14b` fits a 16 GB GPU), or the Claude API (`claude-haiku-5-5`, 12 turns), where the instructions and an index of all content form a cached prompt prefix. Both run the same loop and tools (`src/ai/ollama.ts`, `src/ai/anthropic.ts`).
- Where the loop runs: with Claude, in the browser (`src/ai/remote.ts`), sending each turn to an endpoint that adds the key: the local AI server's `/api/messages` in development, and the website's PHP proxy (`creator-api.php`) in a build. With Ollama, on the local AI server (`/api/describe`). `vite.config.ts` picks the route; `VITE_SF_ENDPOINT` and `VITE_SF_MODEL` override a build's endpoint and model.

```bash
npm run dev      # builder on http://localhost:5173, AI server on 127.0.0.1:8787 (Vite proxies /api)
npm run eval     # runs evals/prompts.md through the same loop
```

`npm run eval` sends each sample description in [evals/prompts.md](evals/prompts.md) through the build loop, prints pass/fail on legality and a summary of each character, and writes a full report with the model's reasons to `evals/results/` (gitignored) for judging theme by eye. It uses the same model settings as the server. `npm run eval -- goblin` runs only the prompts whose heading contains "goblin"; `--model deepseek-r1:14b --mode json` tries another Ollama model, and `--provider anthropic` the Claude API (which costs API usage).

## Manual builder

A click-to-build character builder (Phase 3); the describe box above it is optional. It walks through the name and starting level, Kind, Origin, Profession and Past, the stats (a pool of core points, one per level, each unlocking 3 focus points for its group), Trait picks, and choices (who a Contact is, which language). A panel shows the rules engine's errors, warnings, stats and picks as you go, and the Sheet step is a printable character sheet.

```bash
npm run dev      # http://localhost:5173
npm run build    # static site in dist/; Build it calls creator-api.php next to the page
```

- Every legality check comes from `validateBuild`. The Trait picker tries each pick against the engine, greys out the ones it would reject, and shows the engine's reason.
- The in-progress build is saved in the browser's localStorage. **Export** downloads it as a `Build` JSON file and **Import** loads one back; an imported build's level becomes the campaign's starting level.
- Content is bundled at build time. `npm run dev` reloads the builder and restarts the AI server when `content/` changes; run `npm run build` again to update `dist/`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Runs the builder and the local AI server with hot reload |
| `npm run build` | Builds the builder into `dist/` |
| `npm run preview` | Serves the built `dist/` |
| `npm run validate` | Checks every content file against the schemas and cross-file rules |
| `npm test` | Runs the engine and builder tests |
| `npm run typecheck` | Type-checks everything |
| `npm run check-build -- <file.json>` | Checks a Build JSON file with the rules engine and the unknown-id check |
| `npm run eval` | Runs the sample prompts through the build loop with the configured model |

## Layout

- `content/`: the game's mechanics as YAML, one file per entry. This is the source of truth.
- `src/schema/`: Zod schemas that define what a valid entry looks like.
- `src/engine/`: the rules engine. Parses content (`parse.ts`, no file system, so the browser can use it; `content.ts` loads from disk for Node), defines a character `Build`, `validateBuild` checks a build against the creation rules, and `solveConcept` turns a character concept into a legal build.
- `src/ai/`: the AI layer. `tools.ts` holds the tools the model calls (backed by the engine and content) and the unknown-id check, `prompt.ts` the instructions and content index, `loop.ts` the describe → submit → solve and check → repair loop, and `ollama.ts` / `anthropic.ts` the model adapters.
- `src/server/`: the local AI server that reads the model settings from `.env` and answers `POST /api/messages` (one Claude turn, key added) and `POST /api/describe` (a whole Ollama build).
- `evals/`: sample player descriptions for `npm run eval`.
- `characters/`: Build JSON files made in Claude Code; `npm run check-build` checks them.
- `src/app/`: the manual builder (Vite + React). `content.ts` bundles `content/` with `import.meta.glob`; `check.ts` holds the helpers that ask the engine about picks. `styles.css` holds only the builder's own styles, scoped to `.sf-creator`; everything it shares with the site (colors, fonts, columns, tabs, Trait boxes, the character sheet, the night sky) comes from the site's CSS, which `creator.php` loads on the site and `vite.config.ts` links in development.
- `scripts/validate-content.ts`: checks every content file against the schemas and the cross-file rules.
