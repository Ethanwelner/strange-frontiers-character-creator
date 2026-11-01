import { useMemo } from "react";
import { content, traitById } from "../content.js";
import { hpConditions, playConditions, withCondition, withoutCondition, type HeldCondition } from "../conditions.js";
import { Chip, Sign } from "./ui.js";

// The Conditions, the same on the Character Creator's sheet and in Player
// Tools: the ones HP decides (from `hp` of `maxHp`), and the temporary ones
// the player adds, with Add a Condition above them. They sit in the sheet's
// last column, above the Items.
export function Conditions({
  conditions,
  hp,
  maxHp,
  onChange,
}: {
  conditions: HeldCondition[];
  hp: number;
  maxHp: number;
  onChange: (conditions: HeldCondition[]) => void;
}) {
  const options = useMemo(() => playConditions(content), []);
  const fromHp = hpConditions(hp, maxHp);
  const update = (c: HeldCondition, change: Partial<HeldCondition>) => onChange(conditions.map((x) => (x === c ? { ...x, ...change } : x)));

  return (
    <section className="tools-conditions-side" aria-label="Conditions">
      <h4 className="rule">Conditions</h4>
      {/* Add a Condition, above the ones the character has: picking one adds it, and the
          dropdown goes back to its prompt */}
      <div className="tools-add">
        <select aria-label="Condition to add" value="" onChange={(e) => e.target.value && onChange(withCondition(conditions, content, e.target.value))}>
          <option value="">Add a Condition…</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <ul className="tools-conditions">
        {fromHp.map((id) => {
          const t = traitById.get(id);
          return (
            <li key={id} className="trait-box">
              {/* Badges at the right of the bar, like the sheet's Trait cards: where it came from, and that it's a Condition */}
              <div className="trait-name trait-name-with-chip">
                <span>{t?.name ?? id}</span>
                <span className="trait-name-chips">
                  <Chip>HP</Chip>
                  <Chip>Condition</Chip>
                </span>
              </div>
              <p className="muted small">From HP. {t?.temporary}</p>
              {t && <p className="effect">{t.effect}</p>}
            </li>
          );
        })}
        {conditions.map((c) => {
          const t = traitById.get(c.trait);
          return (
            <li key={c.trait} className="trait-box">
              {/* The name, then at the right of its bar a Condition badge and an ✕ that takes
                  the Condition off */}
              <div className="trait-name tools-condition-head">
                <span>
                  {t?.name ?? c.trait}
                  {t?.ranked ? ` (${c.rank})` : ""}
                </span>
                <span className="trait-name-chips">
                  <Chip>Condition</Chip>
                  <button type="button" className="tools-condition-remove" aria-label={`Remove ${t?.name ?? c.trait}`} onClick={() => onChange(withoutCondition(conditions, c.trait))}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M2 2l16 16M18 2L2 18" fill="none" stroke="currentColor" strokeWidth="2.5" />
                    </svg>
                  </button>
                </span>
              </div>
              {t?.ranked && (
                <div className="stepper tools-rank">
                  <button type="button" onClick={() => update(c, { rank: c.rank - 1 })} disabled={c.rank <= 1} aria-label="Lower rank">
                    <Sign is="minus" />
                  </button>
                  <span className="num">{c.rank}</span>
                  <button type="button" onClick={() => update(c, { rank: c.rank + 1 })} aria-label="Raise rank">
                    <Sign is="plus" />
                  </button>
                </div>
              )}
              {t?.temporary && <p className="muted small">{t.temporary}.</p>}
              {t && <p className="effect">{t.effect}</p>}
              <input
                className="tools-note"
                type="text"
                placeholder="Note, like where or from what"
                aria-label={`Note for ${t?.name ?? c.trait}`}
                value={c.note ?? ""}
                onChange={(e) => update(c, { note: e.target.value || undefined })}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
