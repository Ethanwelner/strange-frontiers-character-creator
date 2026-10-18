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

## Manual builder

A click-to-build character builder (Phase 3), with no AI. It walks through Kind (and form), Origin, Profession and Past, the starting level and each level's stat points, package choices, and Trait picks. A panel shows the rules engine's errors, warnings, stats and picks as you go, and the Sheet step is a printable character sheet.

```bash
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

- Every legality check comes from `validateBuild`. The Trait picker tries each pick against the engine, greys out the ones it would reject, and shows the engine's reason.
- The in-progress build is saved in the browser's localStorage. **Export** downloads it as a `Build` JSON file and **Import** loads one back; an imported build's level becomes the campaign's starting level.
- Content is bundled at build time. `npm run dev` reloads when `content/` changes; run `npm run build` again to update `dist/`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Runs the builder locally with hot reload |
| `npm run build` | Builds the builder into `dist/` |
| `npm run preview` | Serves the built `dist/` |
| `npm run validate` | Checks every content file against the schemas and cross-file rules |
| `npm test` | Runs the engine and builder tests |
| `npm run typecheck` | Type-checks everything |

## Layout

- `content/`: the game's mechanics as YAML, one file per entry. This is the source of truth.
- `src/schema/`: Zod schemas that define what a valid entry looks like.
- `src/engine/`: the rules engine. Parses content (`parse.ts`, no file system, so the browser can use it; `content.ts` loads from disk for Node), defines a character `Build`, and `validateBuild` checks a build against the creation rules.
- `src/app/`: the manual builder (Vite + React). `content.ts` bundles `content/` with `import.meta.glob`; `check.ts` holds the helpers that ask the engine about picks.
- `scripts/validate-content.ts`: checks every content file against the schemas and the cross-file rules.
