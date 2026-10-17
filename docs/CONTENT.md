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

1. Draft it in Campfire.
2. Copy the closest existing file, rename it to the entry's `id` (`kebab-case.yaml`), and fill it in.
3. Set `status`: `placeholder` (names and numbers will change), `draft` (mostly settled) or `final`.
4. Run `npm run validate` and fix what it reports.
5. Open a PR.

## Fields every entry has

| Field | Meaning |
|---|---|
| `id` | Unique, kebab-case, matches the file name |
| `name` | Display name |
| `status` | `placeholder`, `draft` or `final` |
| `plane` | Plane it comes from, e.g. `earth`, `isekai` |
| `region` | Optional, e.g. `dreft` |
| `summary` | One or two reader-facing sentences |
| `tags` | Free-form words the AI searches on, e.g. `seafaring`, `magic` |
| `lore` | Optional lore slug on the Strange Frontiers site, for linking |

## Validator rules

Errors stop a merge; warnings flag things to finish later.

- Schema shape and allowed values (error).
- `id` must match the file name and be unique (error).
- Every stat a Kind gives has `start ≤ max ≤ 20` (error).
- A Kind's starting points total 9 and its maximums total 135, matching Human (warning).
- Granted Traits that don't have a file yet (warning).
