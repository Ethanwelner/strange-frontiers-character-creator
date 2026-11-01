import { Fragment, useCallback, useState } from "react";
import { kindById, packageById } from "../content.js";
import type { Draft } from "../draft.js";
import { BackgroundPopup } from "./BackgroundPopup.js";
import { LooksLine } from "./LooksLine.js";

type Looks = Pick<Draft, "age" | "gender" | "customGender">;

const LABELS = ["Kind", "Origin", "Profession", "Past"];

// The line under the character's name, the same on the Character Creator's
// sheet and in Player Tools: Kind, then age and gender, then Origin,
// Profession and Past, each a plain label in the builder's field label style
// over its value, side by side. The Kind and background link to their cards;
// age and gender have pens to edit them in place.
export function CharacterLine({ draft, onLooks }: { draft: Draft; onLooks: (looks: Looks) => void }) {
  // The Kind or background package whose card is open
  const [showing, setShowing] = useState<string>();
  const close = useCallback(() => setShowing(undefined), []);
  return (
    <>
      <p className="tools-line">
        {[draft.kind, draft.origin, draft.profession, draft.past].map((id, n) => (
          <Fragment key={n}>
            {id && (
              <span className="tools-line-item">
                <span className="field-label">{LABELS[n]}</span>
                <button type="button" className="link" onClick={() => setShowing(id)}>
                  {(n === 0 ? kindById.get(id)?.name : packageById.get(id)?.name) ?? id}
                </button>
              </span>
            )}
            {n === 0 && <LooksLine looks={draft} onChange={onLooks} />}
          </Fragment>
        ))}
      </p>
      {showing && <BackgroundPopup id={showing} onClose={close} />}
    </>
  );
}
