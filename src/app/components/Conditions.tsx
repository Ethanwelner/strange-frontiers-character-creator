import { useMemo, useState } from "react";
import { Popup } from "./popup.js";
import { content, traitById } from "../content.js";
import { CONDITION_TYPES, conditionTypes, hpConditions, playConditions, withCondition, withoutCondition, type ConditionType, type HeldCondition } from "../conditions.js";
import { Effect, Sign, TraitAction } from "./ui.js";
import { CardNote, TraitCard } from "./cards.js";
import { Button } from "./Button.js";
import { SheetTitle } from "./sheet-layout.js";

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
  const add = (id: string) => {
    onChange(withCondition(conditions, content, id));
    setAdding(false);
  };
  const update = (c: HeldCondition, change: Partial<HeldCondition>) => onChange(conditions.map((x) => (x === c ? { ...x, ...change } : x)));

  return (
    <section className="tools-conditions-side" aria-label="Conditions">
      {/* Add Condition at the right end of the title's line, opening the dropdown in a popup */}
      <SheetTitle
        as="h4"
        aside={
          <Button size="small" tone="condition" className="sf-sheet-add" aria-label="Add Condition" onClick={() => setAdding(true)}>
            Add<span className="sf-sheet-add-noun"> Condition</span>
          </Button>
        }
      >
        Conditions
      </SheetTitle>
      {adding && (
        <Popup label="Add a Condition" onClose={() => setAdding(false)} size="narrow" className="sheet-add-popup">
          <h3 className="subhead">Add a Condition</h3>
          <ConditionSearch options={options} onPick={add} />
        </Popup>
      )}
      <ul className="tools-conditions sf-sheet-cards sf-sheet-scroll">
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
              {/* The name, with a ranked Condition's − rank + after it in place
                  of "(rank)", then at the right of its bar an ✕ that takes the
                  Condition off */}
              <TraitCard
                kind="condition"
                name={
                  <>
                    {t?.name ?? c.trait}
                    {t?.ranked && (
                      <span className="stepper tools-rank">
                        <Button kind="bare" className="tools-rank-btn" onClick={() => update(c, { rank: c.rank - 1 })} disabled={c.rank <= 1} aria-label="Lower rank">
                          <Sign is="minus" />
                        </Button>
                        <span className="num">{c.rank}</span>
                        <Button kind="bare" className="tools-rank-btn" onClick={() => update(c, { rank: c.rank + 1 })} aria-label="Raise rank">
                          <Sign is="plus" />
                        </Button>
                      </span>
                    )}
                  </>
                }
                actions={
                  <Button kind="bare" className="tools-condition-remove" aria-label={`Remove ${t?.name ?? c.trait}`} onClick={() => onChange(withoutCondition(conditions, c.trait))}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M2 2l16 16M18 2L2 18" fill="none" stroke="currentColor" strokeWidth="2.5" />
                    </svg>
                  </Button>
                }
              >
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

const TYPE_TITLE: Record<ConditionType, string> = { injury: "Injury", hazard: "Hazard", magic: "Magic", combat: "Combat", misc: "Misc" };

// Add a Condition's picker: a search field that narrows the list as the
// player types (by name, summary or tag), checkboxes for the kinds of
// Condition to show, and the matches below. Picking one, or Enter for the
// first match, adds it and closes the popup.
function ConditionSearch({ options, onPick }: { options: ReturnType<typeof playConditions>; onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<ConditionType>>(new Set());
  const toggle = (c: ConditionType) => {
    const next = new Set(hidden);
    if (!next.delete(c)) next.add(c);
    setHidden(next);
  };
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = options.filter((t) => {
    if (!conditionTypes(t).some((c) => !hidden.has(c))) return false;
    const hay = [t.name, t.summary ?? "", ...(t.tags ?? [])].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  return (
    <div className="condition-search">
      <div className="filters">
        <input
          type="search"
          placeholder="Search name or tag"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) onPick(shown[0].id);
          }}
          aria-label="Search Conditions"
        />
        {CONDITION_TYPES.map((c) => (
          <label key={c} className="check">
            <input type="checkbox" checked={!hidden.has(c)} onChange={() => toggle(c)} /> {TYPE_TITLE[c]}
          </label>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="empty">No Conditions match.</p>
      ) : (
        <ul className="condition-search-list">
          {shown.map((t) => (
            <li key={t.id}>
              <button type="button" className="condition-search-option" onClick={() => onPick(t.id)}>
                <span className="condition-search-name">{t.name}</span>
                <span className="condition-search-types">{conditionTypes(t).map((c) => TYPE_TITLE[c]).join(", ")}</span>
                {t.summary && <span className="condition-search-summary">{t.summary}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
