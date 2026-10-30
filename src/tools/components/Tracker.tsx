import { useCallback, useMemo, useState } from "react";
import type { BuildResult } from "../../engine/validate.js";
import { content, traitById } from "../../app/content.js";
import type { Draft } from "../../app/draft.js";
import { Sheet } from "../../app/components/Sheet.js";
import { StatsStep } from "../../app/components/StatsStep.js";
import { TraitsStep } from "../../app/components/TraitsStep.js";
import { Items } from "../../app/components/Items.js";
import { LorePopup, Sign } from "../../app/components/ui.js";
import {
  addCondition,
  checkPlay,
  currentOf,
  hpConditions,
  maxOf,
  playConditions,
  pointsToPlace,
  removeCondition,
  RESOURCES,
  withResource,
  type Play,
  type ResourceKey,
} from "../play.js";

const NAMES: Record<ResourceKey, string> = { hp: "Hit Points", vp: "Vibe Points", sp: "Savvy Points", mp: "Mana Points" };

// HP, VP, SP and MP, each with its current value against the max the engine
// works out, then the rest of the character sheet. The Conditions sit in the
// right column, under the assistant.
//
// The sheet's stats are the creator's Stats step, which gains its + and −
// whenever there are points to add. Level up (under the level circle) hands this a
// `levelDraft`, the character one level up; adding points to a character
// that has some unplaced starts one at its own level. Submit keeps it, and
// the Level up badge (Cancel while leveling) throws a level up away. Traits available, under the
// sheet's Traits title, opens the creator's Traits step in a popup, without
// the Traits the character already has, and Submit keeps the picks.
export function Tracker({
  play,
  result,
  onChange,
  levelDraft,
  onLevelDraft,
}: {
  play: Play;
  result: BuildResult;
  onChange: (p: Play) => void;
  levelDraft?: Draft;
  onLevelDraft: (d?: Draft) => void;
}) {
  // MP shows once the character has any.
  const shown = RESOURCES.filter((r) => r !== "mp" || maxOf(result, r) > 0);
  const [amounts, setAmounts] = useState<Partial<Record<ResourceKey, string>>>({});
  const set = (r: ResourceKey, value: number) => onChange(withResource(play, result, r, value));
  const apply = (r: ResourceKey, sign: 1 | -1) => {
    const n = Number(amounts[r]);
    if (!Number.isFinite(n) || n <= 0) return;
    set(r, currentOf(play, result, r) + sign * n);
    setAmounts({ ...amounts, [r]: "" });
  };
  const full = shown.every((r) => currentOf(play, result, r) >= maxOf(result, r));

  const [traitDraft, setTraitDraft] = useState<Draft>();
  const closeTraits = useCallback(() => setTraitDraft(undefined), []);
  const traitResult = useMemo(() => (traitDraft ? checkPlay(traitDraft, content) : undefined), [traitDraft]);
  const banked = (result.summary?.picks.universal.banked ?? 0) + (result.summary?.picks.background.banked ?? 0);
  const held = useMemo(() => new Set(result.summary?.traits.map((h) => h.trait) ?? []), [result]);

  // The stats are always the creator's Stats step. Its + and − and Submit
  // show only while there are points to add: after Level up, or when the
  // character has points it never placed. Otherwise it reads like the sheet.
  const editing = levelDraft ?? play.draft;
  const adding = Boolean(levelDraft) || pointsToPlace(play.draft, content);
  const stats = (
    <div className={`tools-stats${adding ? "" : " is-static"}`}>
      <StatsStep draft={editing} onChange={onLevelDraft} floor={play.draft} />
      {adding && (
        <div className="tools-level-actions">
          {/* Cancelling a level up is the Level up badge, under the level circle */}
          <button
            type="button"
            className="build-button"
            disabled={pointsToPlace(editing, content)}
            onClick={() => (onChange({ ...play, draft: editing }), onLevelDraft(undefined))}
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );

  return (
    <section className="tools-tracker">
      {/* The character's name above stands in for this tab's title. */}

      {!result.summary && <div className="notice bad">The engine couldn't read this character, so its maximums aren't known. Check the sheet below.</div>}

      <div className="tools-resources">
        {shown.map((r) => {
          const cur = currentOf(play, result, r);
          const max = maxOf(result, r);
          const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
          return (
            <div key={r} className="c-sheet-box tools-resource">
              {/* HP, then −, the value and +, on one line; the full name shows on hover */}
              <div className="tools-resource-value">
                <strong className="tools-resource-name" title={NAMES[r]}>
                  {r.toUpperCase()}
                </strong>
                <button type="button" onClick={() => set(r, cur - 1)} aria-label={`1 less ${r.toUpperCase()}`}>
                  <Sign is="minus" />
                </button>
                <span className="num" aria-live="polite">
                  {cur}
                  <span className="muted"> / {max}</span>
                </span>
                <button type="button" onClick={() => set(r, cur + 1)} disabled={cur >= max} aria-label={`1 more ${r.toUpperCase()}`}>
                  <Sign is="plus" />
                </button>
              </div>
              <div className={`tools-meter tools-meter-${r}`} aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="tools-resource-apply">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="#"
                  aria-label={`Amount of ${r.toUpperCase()}`}
                  value={amounts[r] ?? ""}
                  onChange={(e) => setAmounts({ ...amounts, [r]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && apply(r, -1)}
                />
                <button type="button" onClick={() => apply(r, -1)}>
                  {r === "hp" ? "Damage" : "Spend"}
                </button>
                <button type="button" onClick={() => apply(r, 1)}>
                  {r === "hp" ? "Heal" : "Regain"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="tools-restore">
        <button type="button" onClick={() => onChange({ ...play, current: {} })} disabled={full}>
          Restore all
        </button>
      </p>

      {/* The rest of the character sheet: stats, Knowledges, Items and Traits */}
      <Sheet
        draft={play.draft}
        result={result}
        embedded
        statsSlot={stats}
        extraColumn={<Items items={play.items} onChange={(items) => onChange({ ...play, items })} />}
        traitsAction={
          banked > 0 && (
            <p className="tools-traits-available">
              <button type="button" className="build-button" onClick={() => setTraitDraft(play.draft)}>
                {banked} {banked === 1 ? "Trait" : "Traits"} available
              </button>
            </p>
          )
        }
      />

      {/* The creator's Traits step, without the Traits the character already has */}
      {traitDraft && traitResult && (
        <LorePopup label="Choose Traits" onClose={closeTraits} className="tools-traits-popup">
          <TraitsStep
            draft={traitDraft}
            campaign={{ startingLevel: traitDraft.level }}
            result={traitResult}
            onChange={setTraitDraft}
            hide={held}
            newFrom={play.draft.traits.length}
          />
          <div className="tools-traits-submit">
            <button
              type="button"
              className="build-button"
              onClick={() => {
                onChange({ ...play, draft: traitDraft });
                setTraitDraft(undefined);
              }}
            >
              Submit
            </button>
          </div>
        </LorePopup>
      )}
    </section>
  );
}

// The Conditions: the ones HP decides, and the temporary ones the player
// adds, with Add a Condition above them. They sit under the assistant.
export function Conditions({ play, result, onChange }: { play: Play; result: BuildResult; onChange: (p: Play) => void }) {
  const options = useMemo(() => playConditions(content), []);
  const hp = hpConditions(currentOf(play, result, "hp"), maxOf(result, "hp"));

  return (
    <section className="tools-conditions-side" aria-label="Conditions">
      {/* Add a Condition, above the ones the character has: picking one adds it, and the
          dropdown goes back to its prompt */}
      <div className="tools-add">
        <select aria-label="Condition to add" value="" onChange={(e) => e.target.value && onChange(addCondition(play, content, e.target.value))}>
          <option value="">Add a Condition…</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <ul className="tools-conditions">
        {hp.map((id) => {
          const t = traitById.get(id);
          return (
            <li key={id} className="trait-box">
              <div className="trait-name">{t?.name ?? id}</div>
              <p className="muted small">From HP. {t?.temporary}</p>
              {t && <p className="effect">{t.effect}</p>}
            </li>
          );
        })}
        {play.conditions.map((c) => {
          const t = traitById.get(c.trait);
          const setRank = (rank: number) =>
            onChange({ ...play, conditions: play.conditions.map((x) => (x === c ? { ...x, rank } : x)) });
          return (
            <li key={c.trait} className="trait-box">
              {/* The name, with an ✕ at the right of its bar that takes the Condition off */}
              <div className="trait-name tools-condition-head">
                <span>
                  {t?.name ?? c.trait}
                  {t?.ranked ? ` (${c.rank})` : ""}
                </span>
                <button type="button" className="tools-condition-remove" aria-label={`Remove ${t?.name ?? c.trait}`} onClick={() => onChange(removeCondition(play, c.trait))}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M2 2l16 16M18 2L2 18" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  </svg>
                </button>
              </div>
              {t?.ranked && (
                <div className="stepper tools-rank">
                  <button type="button" onClick={() => setRank(c.rank - 1)} disabled={c.rank <= 1} aria-label="Lower rank">
                    <Sign is="minus" />
                  </button>
                  <span className="num">{c.rank}</span>
                  <button type="button" onClick={() => setRank(c.rank + 1)} aria-label="Raise rank">
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
                onChange={(e) => onChange({ ...play, conditions: play.conditions.map((x) => (x === c ? { ...x, note: e.target.value || undefined } : x)) })}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
