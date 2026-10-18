# Strange Frontiers Character Creator

Describe the character you want to play, and get a legal Strange Frontiers character built from the game's real Kinds, backgrounds, Traits and equipment.

Early work in progress. See [docs/PLAN.md](docs/PLAN.md) for the roadmap and [docs/CONTENT.md](docs/CONTENT.md) for how to add content.

## Setup

Needs Node 24 or newer (`.nvmrc` pins it, so `nvm use` picks it up).

```bash
nvm use
npm install
npm run validate
npm test
```

To build characters from a description, add an Anthropic API key:

1. Copy `.env.example` to `.env`.
2. Paste your key after `ANTHROPIC_API_KEY=`.
3. Restart `npm run dev` if it's running.

`.env` is gitignored. The key is read only by the local AI server; it never reaches the browser and is never logged. Without a key the builder still works by hand, and **Build it** says to add the key.

## Building characters with Claude Code (no API credits)

Until the builder is ready for real playtesting, characters are built in a Claude Code session instead of through the API, which needs prepaid credits. The loop is the same one the app runs: Claude reads the description, picks only from `content/`, and the engine checks the build.

1. In Claude Code, describe the character and ask for a build, e.g. "Build a character: a goblin hedge witch from a farming village."
2. Claude writes a `Build` JSON file to `characters/` and checks it:

   ```bash
   npm run check-build -- characters/grosh.json
   ```

   This runs the same checks as the AI layer: unknown ids first, then `validateBuild`. It prints errors, warnings, stats, picks and held Traits, and exits non-zero unless the build is legal. Add `--level 2` for a campaign that starts above level 1.
3. Claude fixes anything the check reports and runs it again until the build is legal.
4. In the builder, **Import** the file. From there it's editable like any build, and Contacts get recorded on the Choices step.

`characters/grosh.json` is an example.

## Describe your character (AI)

Type a description in plain words and press **Build it** (Phase 4). Claude reads the concept, looks up the real Kinds, packages and Traits with tools, proposes a full build, and checks it with the rules engine, repairing it until the engine accepts it or a turn limit is hit. The build fills the builder with a one-line reason per choice, and stays fully editable, with live validation, afterward.

- Claude never invents content or does the stat math. Every id it proposes is checked against `content/` in code, and every build goes through `validateBuild`.
- Claude never names a Contact: who it is is up to you, and you write it on the Choices step. Until you do, the build is still legal and the panel shows a reminder. Dreftian-language choices pick from the Dreftian languages in content (Dreftan for now).
- The model is `claude-opus-5-5`. The instructions and an index of all content form a cached prompt prefix, so repair turns are cheap.

```bash
npm run dev      # builder on http://localhost:5173, AI server on 127.0.0.1:8787 (Vite proxies /api)
npm run eval     # runs evals/prompts.md against the real API
```

`npm run eval` sends each sample description in [evals/prompts.md](evals/prompts.md) to Claude, prints pass/fail on legality and a summary of each character, and writes a full report with Claude's reasons to `evals/results/` (gitignored) for judging theme by eye. `npm run eval -- goblin` runs only the prompts whose heading contains "goblin". It needs the key in `.env`, and each run costs API usage.

## Manual builder

A click-to-build character builder (Phase 3); the describe box above it is optional. It walks through Kind (and form), Origin, Profession and Past, the starting level and each level's stat points, package choices, and Trait picks. A panel shows the rules engine's errors, warnings, stats and picks as you go, and the Sheet step is a printable character sheet.

```bash
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (the AI server isn't part of it)
```

- Every legality check comes from `validateBuild`. The Trait picker tries each pick against the engine, greys out the ones it would reject, and shows the engine's reason.
- The in-progress build is saved in the browser's localStorage. **Export** downloads it as a `Build` JSON file and **Import** loads one back; an imported build's level becomes the campaign's starting level.
- Content is bundled at build time. `npm run dev` reloads when `content/` changes; run `npm run build` again to update `dist/`.

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
| `npm run eval` | Runs the sample prompts against the real Claude API (needs a key in `.env`) |

## Layout

- `content/`: the game's mechanics as YAML, one file per entry. This is the source of truth.
- `src/schema/`: Zod schemas that define what a valid entry looks like.
- `src/engine/`: the rules engine. Parses content (`parse.ts`, no file system, so the browser can use it; `content.ts` loads from disk for Node), defines a character `Build`, and `validateBuild` checks a build against the creation rules.
- `src/ai/`: the AI layer. `tools.ts` holds the tools Claude calls (backed by the engine and content) and the unknown-id check, `prompt.ts` the instructions and content index, `loop.ts` the describe → build → validate → repair loop.
- `src/server/`: the local AI server that holds the API key and answers `POST /api/describe`.
- `evals/`: sample player descriptions for `npm run eval`.
- `characters/`: Build JSON files made in Claude Code; `npm run check-build` checks them.
- `src/app/`: the manual builder (Vite + React). `content.ts` bundles `content/` with `import.meta.glob`; `check.ts` holds the helpers that ask the engine about picks.
- `scripts/validate-content.ts`: checks every content file against the schemas and the cross-file rules.
