# Strange Frontiers Character Creator

Describe the character you want to play, and get a legal Strange Frontiers character built from the game's real Kinds, backgrounds, Traits and equipment.

Early work in progress. See [docs/PLAN.md](docs/PLAN.md) for the roadmap and [docs/CONTENT.md](docs/CONTENT.md) for how to add content.

## Setup

```bash
npm install
npm run validate
npm test
```

## Layout

- `content/`: the game's mechanics as YAML, one file per entry. This is the source of truth.
- `src/schema/`: Zod schemas that define what a valid entry looks like.
- `src/engine/`: the rules engine. Loads content, defines a character `Build`, and `validateBuild` checks a build against the creation rules.
- `scripts/validate-content.ts`: checks every content file against the schemas and the cross-file rules.
