import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { BuildResult } from "../../engine/validate.js";
import { content } from "../../app/content.js";
import type { Draft } from "../../app/draft.js";
import { RESOURCE_NAMES, Sheet } from "../../app/components/Sheet.js";
import { StatsStep } from "../../app/components/StatsStep.js";
import { TraitsStep } from "../../app/components/TraitsStep.js";
import { Icon, LorePopup, Sign } from "../../app/components/ui.js";
import { checkPlay, currentOf, maxOf, pointsToPlace, RESOURCES, withResource, type Play, type ResourceKey } from "../play.js";

// The character's name (`head`, from the app) over HP, VP, SP and MP, each
// with its current value against the max the engine works out, in the first
// of the sheet's boxes, then the rest of the character sheet in its own boxes.
//
// The sheet's stats are the creator's Stats step, which gains its + and −
// whenever there are points to add. Level up (beside the name) hands this a
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
  head,
}: {
  play: Play;
  result: BuildResult;
  onChange: (p: Play) => void;
  levelDraft?: Draft;
  onLevelDraft: (d?: Draft) => void;
  // The first box: the portrait, name and character line
  head: ReactNode;
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
          {/* Cancelling a level up is the + on the level blob's corner, which turns into Cancel.
              Submit is green and glitches once every point is placed. */}
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
      {!result.summary && <div className="notice bad">The engine couldn't read this character, so its maximums aren't known. Check the sheet below.</div>}

      {/* The character's header, in a box like the sheet's head */}
      <div className="c-sheet-box tools-head">{head}</div>

      {/* HP, VP, SP and MP, in their own box under it */}
      <div className="c-sheet-box tools-resources-box">
        <div className="tools-resources">
          {shown.map((r) => {
            const cur = currentOf(play, result, r);
            const max = maxOf(result, r);
            const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
            return (
              <div key={r} className="tools-resource">
                {/* HP, then −, the value, + and restore to full, on one line; the full name
                    shows on hover */}
                <div className="tools-resource-value">
                  <strong className={`tools-resource-name resource-${r}`} title={RESOURCE_NAMES[r]}>
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
                  <button
                    type="button"
                    onClick={() => set(r, max)}
                    disabled={cur >= max}
                    aria-label={`Restore ${r.toUpperCase()} to full`}
                    title="Restore to full"
                  >
                    <Icon name="restore" />
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
                    {r === "hp" ? "Heal" : "Gain"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The rest of the character sheet: stats, Knowledges, Conditions and Items, and Traits */}
      <Sheet
        draft={play.draft}
        result={result}
        embedded
        statsSlot={stats}
        items={play.items}
        onItems={(items) => onChange({ ...play, items })}
        conditions={play.conditions}
        onConditions={(conditions) => onChange({ ...play, conditions })}
        hp={currentOf(play, result, "hp")}
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
