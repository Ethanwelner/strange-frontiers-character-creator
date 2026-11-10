import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Popup } from "../../app/components/popup.js";
import type { BuildResult } from "../../engine/validate.js";
import { content } from "../../app/content.js";
import type { Draft } from "../../app/draft.js";
import { Sheet } from "../../app/components/Sheet.js";
import { RESOURCE_NAMES } from "../../app/components/sheet-layout.js";
import { StatsStep } from "../../app/components/StatsStep.js";
import { sheetStatGroups, StatBlock } from "../../app/components/stats.js";
import { TraitsStep } from "../../app/components/TraitsStep.js";
import { Icon, Sign } from "../../app/components/ui.js";
import { checkPlay, currentOf, maxOf, pointsToPlace, RESOURCES, withResource, type Play, type ResourceKey } from "../play.js";
import { Button } from "../../app/components/Button.js";

// The character sheet in its play context (sheet-layout.tsx): HP, VP, SP and
// MP live, each with its current value against the max the engine works out,
// and Level up and the app's actions (`corner`, `actions`, from the app).
//
// The sheet's stats are the plain stat block, which becomes the creator's
// Stats step, with its + and −, whenever there are points to add. Level up (beside the name) hands this a
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
  corner,
  actions,
}: {
  play: Play;
  result: BuildResult;
  onChange: (p: Play) => void;
  levelDraft?: Draft;
  onLevelDraft: (d?: Draft) => void;
  // Level up, on the level's corner, and Download, Switch and the rules problems
  corner: ReactNode;
  actions: ReactNode;
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
  const heldIds = useMemo(() => new Set(result.summary?.traits.map((h) => h.trait) ?? []), [result]);

  // The stats are the stat block. While there are points to add (after Level
  // up, or when the character has points it never placed) they're the
  // creator's Stats step instead, with its + and − and Submit.
  const editing = levelDraft ?? play.draft;
  const adding = Boolean(levelDraft) || pointsToPlace(play.draft, content);
  const stats = !adding ? (
    <StatBlock groups={sheetStatGroups(play.draft, result)} />
  ) : (
    <div className="tools-stats">
      <StatsStep draft={editing} onChange={onLevelDraft} floor={play.draft} />
      {adding && (
        <div className="tools-level-actions">
          {/* Cancelling a level up is the + on the level blob's corner, which turns into Cancel.
              Submit is green and glitches once every point is placed. */}
          <Button
            tone={pointsToPlace(editing, content) ? "gray" : "primary"}
            ready={!pointsToPlace(editing, content)}
            className="build-button"
            disabled={pointsToPlace(editing, content)}
            onClick={() => (onChange({ ...play, draft: editing }), onLevelDraft(undefined))}
          >
            Submit
          </Button>
        </div>
      )}
    </div>
  );

  // HP, VP, SP and MP, live
  const resources = (
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
                  <Button round="md" onClick={() => set(r, cur - 1)} aria-label={`1 less ${r.toUpperCase()}`}>
                    <Sign is="minus" />
                  </Button>
                  <span className="num" aria-live="polite">
                    {/* Above the max (bonus points), the value takes the resource's color */}
                    {cur > max ? <span className={`resource-${r}`} title={`Above the max of ${max}`}>{cur}</span> : cur}
                    <span className="muted"> / {max}</span>
                  </span>
                  <Button round="md" onClick={() => set(r, cur + 1)} aria-label={`1 more ${r.toUpperCase()}`}>
                    <Sign is="plus" />
                  </Button>
                  <Button
                    round="md"
                    onClick={() => set(r, max)}
                    disabled={cur >= max}
                    aria-label={`Restore ${r.toUpperCase()} to full`}
                    title="Restore to full"
                  >
                    <Icon name="restore" />
                  </Button>
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
                  <Button onClick={() => apply(r, -1)}>
                    {r === "hp" ? "Damage" : "Spend"}
                  </Button>
                  <Button onClick={() => apply(r, 1)}>
                    {r === "hp" ? "Heal" : "Gain"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
  );
  const draft = play.draft;

  return (
    <section className="tools-tracker">
      {!result.summary && <div className="notice bad">The engine couldn't read this character, so its maximums aren't known. Check the sheet below.</div>}

      <Sheet
        context="play"
        draft={draft}
        result={result}
        corner={corner}
        actions={actions}
        resources={resources}
        stats={stats}
        onName={(name) => onChange({ ...play, draft: { ...draft, name } })}
        onLooks={(looks) => onChange({ ...play, draft: { ...draft, ...looks } })}
        onPortrait={(portrait) => onChange({ ...play, draft: { ...draft, portrait } })}
        onDescription={(description) => onChange({ ...play, draft: { ...draft, description } })}
        items={play.items}
        onItems={(items) => onChange({ ...play, items })}
        conditions={play.conditions}
        onConditions={(conditions) => onChange({ ...play, conditions })}
        hp={currentOf(play, result, "hp")}
        traitsAction={
          // Add traits, like Items' and Conditions' add buttons; the picks left show under the title
          banked > 0 && (
            <Button size="small" tone="primary" className="sf-sheet-add" aria-label="Add traits" onClick={() => setTraitDraft(play.draft)}>
              Add<span className="sf-sheet-add-noun"> traits</span>
            </Button>
          )
        }
      />

      {/* The creator's Traits step, without the Traits the character already has */}
      {traitDraft && traitResult && (
        <Popup label="Choose Traits" onClose={closeTraits} size="wide" scroll="inner" className="tools-traits-popup">
          <TraitsStep
            draft={traitDraft}
            campaign={{ startingLevel: traitDraft.level }}
            result={traitResult}
            onChange={setTraitDraft}
            hide={heldIds}
            newFrom={play.draft.traits.length}
          />
          <div className="sf-popup-foot">
            {/* Green and glitching, like Add items, once the picks change the character's Traits */}
            <Button
              tone={JSON.stringify(traitDraft.traits) !== JSON.stringify(play.draft.traits) ? "primary" : "gray"}
              ready={JSON.stringify(traitDraft.traits) !== JSON.stringify(play.draft.traits)}
              className="build-button"
              onClick={() => {
                onChange({ ...play, draft: traitDraft });
                setTraitDraft(undefined);
              }}
            >
              Submit
            </Button>
          </div>
        </Popup>
      )}
    </section>
  );
}
