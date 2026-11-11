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
  items/                 Stock items, from the Sheet's Items tab
```

Stock items are what the AI builder packs for a character (from their own plane or any plane, never money until wealth has rules), and what the sheet's Items column suggests while typing a name. A stock item on the sheet shows its description and details; players can still write in anything else.

## Steps

1. Draft it as a row on its tab of the "Strange frontiers traits" Google Sheet (Kinds, Origins, Professions, Pasts, Items, or the Trait's category).
2. Copy the closest existing file, rename it to the entry's `id` (`kebab-case.yaml`), and fill it in.
3. Set `status`: `placeholder` (names and numbers will change), `draft` (mostly settled) or `final`.
4. Run `npm run validate` and fix what it reports.
5. Open a PR.

## From the Sheet to YAML

The Sheet: https://docs.google.com/spreadsheets/d/1AP0TYovynUgseYa7s86-5OXWE1x8DoCvfkK39TqeUX8/edit

Every tab's Description is `summary`, Tags is `tags`, and Notes is for anything the columns don't cover.

| Sheet column | YAML |
|---|---|
| Plane, Region, Lore | `plane`, `region`, `lore`. Plane is Earth, Isekai or Any (lowercase in YAML); the Sheet's "Settled Systems" is `earth`. A package's Region is The Settled Systems (no `region`), Any (no `region`) or a nation or kingdom (its slug, like `union-of-texas`). Every Trait tab has a Plane column after Name: a Trait is Earth or Isekai only when it names that setting's places, peoples, institutions, languages, technology or magic, and Any otherwise |
| Kinds: Features | `features`, one `name: description` per line |
| Kinds: Trait Access, Free Points, Max Total | `traitAccess`, `freePoints`, `maxTotal` |
| Kinds: Movement | `movement`, like `10 m` (the default when left out); `-` for a Kind with no body of its own, like the AI Core |
| Packages: Bonus | `bonusPoints`, like `[{ count: 1, group: physical }]`: free points the player places in that group's focus stats |
| Packages: Core Bonus | `coreBonus`, like `{ magic: 1 }`: added to Magic without a level, if the character can level it |
| Packages: Bonus (Wealth) | `wealth`, like `wealth: 2`, written in the Bonus column as `+2 Wealth`: added to the character's Wealth (−1 to 4), which sets its starting Kit Points (3 + 2 × Wealth) and the dearest Kit Cost it can start with (Wealth + 1). See src/engine/wealth.ts |
| Kinds: Grants, Resources | `grants` (Traits every character of the Kind holds, like Magical Heritage), `resources` (like `{ mp: 6 }`) |
| Kinds: Physical / Social / Mental (bonus/max) | `stats`, from lines like "Endurance +1/15" |
| Packages: Grants | `grants`; "Knowledge: X (1)" is Trait `x` at rank 1 |
| Packages: Choices | `choices`, with the Sheet text as their `note`: "+1 Contact" is `from: contact`, "+1 Language" is `from: language`, "+1 Language (Spoken & Written)" is `from: spoken-and-written-language` |
| Packages: Background Traits | `backgroundTraits` |
| Traits: Category | `category`; Language rows are `knowledge` with `types: [language]`. "X (Spoken)" has id `x` and "X (Written)" `x-written`, both with `language: x`, which pairs them for spoken-and-written choices |
| Traits: Ranked, Conveyed | `ranked`, `conveyed` |
| Traits: Effect | `effect`, left empty for a Trait that only marks a state other effects check for, like Healthy. Each part of an effect that does something different can be its own bullet: in the Sheet, a line per bullet starting with `- ` in the cell; in YAML, the same lines joined with `\n` (like the Wielder skills). Lines without `- ` show as paragraphs |
| Traits: Stat Requirements | `minStats` (focus or core: "Power 3", "Physical 5") |
| Traits: Prerequisites | a Trait's name in `prerequisites`, "Any Pilot skill" in `prerequisiteTags: [pilot]`, anything else in `rpRequirement` |
| Traits: Mastery, Temporary | `mastery`, `temporary` |
| Traits: Keywords | `types`, lowercase: every Trait tab has one Keywords column, a comma-separated list like `Elemental, Potion, Artifact`, instead of a column per attribute. Keywords include what other effects target (Injury, Cybernetic, Supernatural, Language), Potion (it can be brewed) and Artifact (it can be imbued into an artifact that enhances the Item or its wearer), and a spell's school (Elemental, Enchantment, Divination, Conjuration, Illusion, Enervation, Necromancy, Restoration, Mentalism). A special stat's keyword, like Magic, is the exception: it becomes `list` (below), not a type |
| Traits: Modifiers, Action | `modifiers` (like `Priority -1, Attack Rolls -1`) and `action`, as the Sheet words them |
| Items: Category, Creator Category | `type` (the site's Items page categories, lowercase: weapon, wearable, equipment, structure, vehicle, animal, chassis, misc) and `category` (the creator's: weapon, armor, gear, consumable, currency, chassis, other) |
| Items: Damage Profile, Resistances, Uses, Exclusive | `damage`, `resistances`, `uses` and `slot`, as the Sheet words them, in the Items page's damage type order. Damage separated by commas is all dealt at once (`2 Blunt, 2 Electrical`); options separated by ` / ` are a choice (`5 Slashing / 4 Piercing`). Resistances carry amounts too, like `3 Blunt, 4 Slashing, 2 Piercing (head)` |
| Items: Attack Type, Max Range, Attack Stat, Area of Effect, Reload, On Hit, Modifiers | `attackType` (`Melee`, `Ranged` or `Ranged, Thrown`), `maxRange` (like `2 m`; Thrown weapons leave it out, since their range is Power × 3), `attackStat` (`Grace / Power` is a choice), `areaOfEffect` (a radius, like `5 m`), `reload` (`Partial` or `Full`), `onHit` and `modifiers` (like `Defense +4 (when Defending)`), as the Sheet words them |
| Items: Value, Currency | `value` and `currency`: one value per item, in the currency of its plane of origin (Luras for Isekai, ERC for Earth and Any) |
| Items: Kit Cost | Worked out from the value in bands of ten (1 Luras ≈ 10 ERC): 0 (Basic) under 100 ERC, 1 under 1,000, 2 under 10,000, 3 under 100,000, 4 under 1,000,000, 5 above. `kitCost` overrides it where the band is wrong for the game |
| Chassis (its own tab) | An item in `content/items` with `type: chassis`, `category: chassis` and a `chassis` block: `core` (the Physical column), `stats` (`endurance`, `power`, `grace`; they add up to core × 3), optional `movement`, `attacks` (item ids; each Attack is its own item, tagged `built-in`, which keeps it out of Add item) and `traits` (Trait ids from the Traits column). Description, Resistances, Value and Currency map as for Items. An AI Core (a Kind with `core`) inhabits the chassis it has equipped: its Physical stats, HP (10 + those stats + its Traits' `resources.hp`, like Reinforced's), Movement and Traits become the character's, and one inhabited at a time |
| Keywords: a special stat, like Magic | `list`, lowercase (`list: magic`). A Trait built on a special stat lives in that stat's own Sheet tab (Magic, for now) whatever its category, with the stat among its Keywords, and the creator gives each list its own tab on the Traits step, open to every character. Only Traits a character couldn't have without wielding magic need a Magic stat requirement; broadly related ones, like Relic Handling or Knowledge: Magic on Isekai, sit in the tab without one |
| Wielder tab | `list: wielder`. Wielder Skills are ordinary Skills (`category: skill`, no special stat) kept on their own Sheet tab and their own Traits step tab, so they don't crowd the Skills. On any list's tab, a Trait on the character's Background Trait list takes a Background pick while one is left |
| Traits: Notes | "Background-only" is `background`, "Choice: which seas" is a `place` choice (below) |

## Fields every entry has

| Field | Meaning |
|---|---|
| `id` | Unique, kebab-case, matches the file name |
| `name` | Display name |
| `status` | `placeholder`, `draft` or `final` |
| `plane` | Plane it comes from, e.g. `earth`, `isekai`, or `any` for a Trait from anywhere. In the builder, `isekai` cards show the Isekai mark and `earth` cards The Settled Systems mark; `any` cards show none. |
| `region` | Optional, e.g. `dreft` |
| `summary` | One or two reader-facing sentences |
| `tags` | Free-form words the AI searches on, e.g. `seafaring`, `magic` |
| `lore` | Optional lore slug on the Strange Frontiers site, for linking |

Packages and Traits can both list `choices` (`choose`, `from`, optional `note`): a pool the player picks from, like `contact` or `language`. Notes use the cards' shorthand: `"+1 Contact"`, `"+1 Language"`, `"+1 Language (Spoken & Written)"`, `"+1 Contact per rank"` (quoted, since YAML can't start a plain value with `+`). A Trait's choices are asked once the character holds it, once per rank if it's ranked, as with Additional Contact and Additional Language. `perRank: false` asks only once, whatever the rank.

Four pools are written in by the player rather than picked from Traits: `contact` (who the Contact is), `place` (which seas, region or road a Knowledge covers, like Seafaring's `note: "Which seas"` with `perRank: false`), `quarry` (what a Hunter hunts) and `detail` (anything else a Trait needs named, like Heavy Debts' `note: "Who the debt is owed to"`). On the Sheet each is a "Choice: …" note. The AI builder leaves them for the player, and an unanswered one is a reminder, not an error.

A Trait marked `conveyed: true` (Explorers’ Lodge Membership, Imperial Service Record) can only come from a package's grants or from play, never from a pick, so it can't go on a package's `backgroundTraits` (the validator errors). Circumstance Traits use `category: circumstance`.

A Trait that raises Wealth lists it under `wealth` (like `wealth: 1`), counted once per rank held. A Trait that raises HP, VP, SP or MP lists it under `resources` (for example `resources: { hp: 2 }`), counted once per rank held. A Trait that lets a character level a core stat beyond Physical, Social and Mental lists it under `coreAccess`, like Magic Access's `coreAccess: [magic]`. A Trait built on or closely related to a special stat goes on that stat's list (`list: magic`); each list is its own tab on the Traits step, open to every character, and stat requirements like Magic 1 decide who can actually take its Traits. A Trait can convey other Traits for as long as it's held (`grants`, like Magical Heritage's `magic-access`), so a Kind or package can hand out Magic Access through a Trait of its own.

## Validator rules

Errors stop a merge; warnings flag things to finish later.

- Schema shape and allowed values (error).
- `id` must match the file name and be unique (error).
- Every stat a Kind gives has `start ≤ max ≤ 20` (error).
- A Kind's starting points total 9 and its maximums total 135, matching Human (warning). A Kind that's deliberately off 135 sets `maxTotal` to its real total, like the AI Core's 120, and is checked against that instead.
- Granted Traits that don't have a file yet (warning).
