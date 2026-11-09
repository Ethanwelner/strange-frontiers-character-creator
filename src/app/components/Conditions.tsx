import { useMemo, useState } from "react";
import { content, traitById } from "../content.js";
import { hpConditions, playConditions, withCondition, withoutCondition, type HeldCondition } from "../conditions.js";
import { Effect, LorePopup, Sign, TraitAction } from "./ui.js";
import { CardNote, TraitCard } from "./cards.js";

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
  // Add Condition's popup, open or not
  const [adding, setAdding] = useState(false);
  const update = (c: HeldCondition, change: Partial<HeldCondition>) => onChange(conditions.map((x) => (x === c ? { ...x, ...change } : x)));

  return (
    <section className="tools-conditions-side" aria-label="Conditions">
      {/* Add Condition at the right end of the title's line, opening the dropdown in a popup */}
      <div className="sheet-section-head">
        <h4 className="rule">Conditions</h4>
        <button type="button" className="sheet-section-add" aria-label="Add Condition" onClick={() => setAdding(true)}>
          Add<span className="sheet-section-add-noun"> Condition</span>
        </button>
      </div>
      {adding && (
        <LorePopup label="Add a Condition" onClose={() => setAdding(false)} className="sheet-add-popup">
          <h3 className="subhead">Add a Condition</h3>
          {/* Picking one adds it and closes the popup */}
          <div className="tools-add">
            <select
              aria-label="Condition to add"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                onChange(withCondition(conditions, content, e.target.value));
                setAdding(false);
              }}
            >
              <option value="">Pick a Condition…</option>
              {options.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </LorePopup>
      )}
      <ul className="tools-conditions">
        {fromHp.map((id) => {
          const t = traitById.get(id);
          return (
            <li key={id}>
              <TraitCard kind="condition" name={t?.name ?? id}>
                <CardNote>From HP. {t?.temporary}</CardNote>
                {t && <Effect text={t.effect} />}
                <TraitAction action={t?.action} />
              </TraitCard>
            </li>
          );
        })}
        {conditions.map((c) => {
          const t = traitById.get(c.trait);
          return (
            <li key={c.trait}>
              {/* The name, then at the right of its bar an ✕ that takes the Condition off */}
              <TraitCard
                kind="condition"
                name={t?.name ?? c.trait}
                rank={t?.ranked ? c.rank : undefined}
                actions={
                  <button type="button" className="tools-condition-remove" aria-label={`Remove ${t?.name ?? c.trait}`} onClick={() => onChange(withoutCondition(conditions, c.trait))}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M2 2l16 16M18 2L2 18" fill="none" stroke="currentColor" strokeWidth="2.5" />
                    </svg>
                  </button>
                }
              >
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
                {t?.temporary && (
                  <CardNote>
                    {t.temporary}
                    {/[.!?]$/.test(t.temporary) ? "" : "."}
                  </CardNote>
                )}
                {t && <Effect text={t.effect} />}
                <TraitAction action={t?.action} />
              </TraitCard>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
