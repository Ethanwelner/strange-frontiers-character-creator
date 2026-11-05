import { useCallback, useState } from "react";
import { kindById, packageById } from "../content.js";
import type { Draft, Looks } from "../draft.js";
import { BackgroundPopup } from "./BackgroundPopup.js";
import { LooksLine } from "./LooksLine.js";

const LABELS = ["Kind", "Origin", "Profession", "Past"];

// The line under the character's name, the same on the Character Creator's
// sheet and in Player Tools: Kind, age, gender, height and weight on one row, then Origin,
// Profession and Past stacked under it, each a plain label in the builder's
// field label style over its value. The Kind and background link to their cards;
// the looks have pens to edit them in place.
export function CharacterLine({ draft, onLooks }: { draft: Draft; onLooks: (looks: Looks) => void }) {
  // The Kind or background package whose card is open
  const [showing, setShowing] = useState<string>();
  const close = useCallback(() => setShowing(undefined), []);
  // One label over its link, or nothing if it isn't picked yet
  const item = (n: number, id?: string) =>
    id && (
      <span className="tools-line-item">
        <span className="field-label">{LABELS[n]}</span>
        <button type="button" className="link" onClick={() => setShowing(id)}>
          {(n === 0 ? kindById.get(id)?.name : packageById.get(id)?.name) ?? id}
        </button>
      </span>
    );
  return (
    <>
      <div className="tools-line">
        {/* Age, gender, height and weight on one line, then the Kind and the background packages on the next, each wrapping when it runs out of room */}
        <p className="tools-line-row">
          <LooksLine looks={draft} onChange={onLooks} />
        </p>
        <p className="tools-line-row">
          {item(0, draft.kind)}
          {item(1, draft.origin)}
          {item(2, draft.profession)}
          {item(3, draft.past)}
        </p>
      </div>
      {showing && <BackgroundPopup id={showing} onClose={close} />}
    </>
  );
}
