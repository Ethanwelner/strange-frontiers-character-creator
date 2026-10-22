# Adding content

Every entry is one YAML file under `content/`. The folder says what kind of entry it is:

```
content/
  kinds/                 Human and other widely available Kinds
  kinds/dreft/           Kinds native to Dreft
  origins/<region>/      Origin packages
  professions/<region>/  Profession packages
  pasts/<region>/        Past packages
  traits/<category>/     Traits, one per file
```

## Steps

1. Draft it as a row on its tab of the "Strange frontiers traits" Google Sheet (Kinds, Origins, Professions, Pasts, or the Trait's category).
2. Copy the closest existing file, rename it to the entry's `id` (`kebab-case.yaml`), and fill it in.
3. Set `status`: `placeholder` (names and numbers will change), `draft` (mostly settled) or `final`.
4. Run `npm run validate` and fix what it reports.
5. Open a PR.

## From the Sheet to YAML

The Sheet: https://docs.google.com/spreadsheets/d/1AP0TYovynUgseYa7s86-5OXWE1x8DoCvfkK39TqeUX8/edit

Every tab's Description is `summary`, Tags is `tags`, and Notes is for anything the columns don't cover.

| Sheet column | YAML |
|---|---|
| Plane, Region, Lore | `plane`, `region`, `lore`. Plane is Earth, Isekai or Any (lowercase in YAML). Every Trait tab has a Plane column after Name: a Trait is Earth or Isekai only when it names that setting's places, peoples, institutions, languages, technology or magic, and Any otherwise |
| Kinds: Features | `features`, one `name: description` per line |
| Kinds: Trait Access, Free Points, Max Total | `traitAccess`, `freePoints`, `maxTotal` |
| Kinds: Physical / Social / Mental (start/max) | `stats`, from lines like "Endurance 1/15" |
| Packages: Grants | `grants`; "Knowledge: X (1)" is Trait `x` at rank 1 |
| Packages: Choices | `choices`, as their `note` |
| Packages: Background Traits | `backgroundTraits` |
| Traits: Category | `category`; Language rows are `knowledge` with `types: [language]` |
| Traits: Ranked, Conveyed | `ranked`, `conveyed` |
| Traits: Effect | `effect` |
| Traits: Stat Requirements | stats go in `minStats` (focus or core: "Power 3", "Physical 5"), a Trait's name in `prerequisites`, "Any Pilot skill" in `prerequisiteTags: [pilot]`, anything else in `rpRequirement` |
| Traits: Notes | "Mastery" is `mastery`, "Background-only" is `background`, "Type: X" is `types`, "Temporary (…)" is `temporary` |

## Fields every entry has

| Field | Meaning |
|---|---|
| `id` | Unique, kebab-case, matches the file name |
| `name` | Display name |
| `status` | `placeholder`, `draft` or `final` |
| `plane` | Plane it comes from, e.g. `earth`, `isekai`, or `any` for a Trait from anywhere. In the builder, `isekai` cards show the Isekai mark and `earth` cards The Systems mark; `any` cards show none. |
| `region` | Optional, e.g. `dreft` |
| `summary` | One or two reader-facing sentences |
| `tags` | Free-form words the AI searches on, e.g. `seafaring`, `magic` |
| `lore` | Optional lore slug on the Strange Frontiers site, for linking |

Packages and Traits can both list `choices` (`choose`, `from`, optional `note`): a pool the player picks from, like `contact` or `language`. Notes use the cards' shorthand: `"+1 Contact"`, `"+1 Language"`, `"+1 Language (Spoken & Written)"`, `"+1 Contact per rank"` (quoted, since YAML can't start a plain value with `+`). A Trait's choices are asked once the character holds it, once per rank if it's ranked, as with Additional Contact and Additional Language.

A Trait marked `conveyed: true` (Explorers’ Lodge Membership, Imperial Service Record) can only come from a package's grants or from play, never from a pick, so it can't go on a package's `backgroundTraits` (the validator errors). Circumstance Traits use `category: circumstance`.

A Trait that raises HP, VP or SP lists it under `resources` (for example `resources: { hp: 2 }`), counted once per rank held.

## Validator rules

Errors stop a merge; warnings flag things to finish later.

- Schema shape and allowed values (error).
- `id` must match the file name and be unique (error).
- Every stat a Kind gives has `start ≤ max ≤ 20` (error).
- A Kind's starting points total 9 and its maximums total 135, matching Human (warning). A Kind that's deliberately off 135 sets `maxTotal` to its real total, like the AI Core's 120, and is checked against that instead.
- Granted Traits that don't have a file yet (warning).
