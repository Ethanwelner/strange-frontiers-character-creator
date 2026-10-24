import { MAX_LEVEL } from "../../ai/level.js";
import type { Draft } from "../draft.js";
import { KindCards } from "./KindCards.js";
import { StepHeader } from "./ui.js";

const MAX_START = MAX_LEVEL;

interface Props {
  draft: Draft;
  startingLevel: number;
  onChange: (d: Draft) => void;
  onStartingLevel: (level: number) => void;
}

// The character's name, the level the campaign starts it at, and its Kind.
export function CharacterStep({ draft, startingLevel, onChange, onStartingLevel }: Props) {
  return (
    <section>
      <StepHeader step="character" title="Character">
        Name your character, set the level your campaign starts at, and choose a Kind. Your GM sets the level; most campaigns start at 3.
        A Kind sets your level 0 stats and how far each can go; numbers show start/max.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box character-fields">
        <label className="field name-field">
          <span className="field-label">Character Name</span>
          <input value={draft.name ?? ""} placeholder="Unnamed character" onChange={(e) => onChange({ ...draft, name: e.target.value || undefined })} />
        </label>
        <label className="field name-field level-field">
          <span className="field-label">Starting Level</span>
          <select value={startingLevel} onChange={(e) => onStartingLevel(Number(e.target.value))}>
            {Array.from({ length: MAX_START }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <KindCards draft={draft} onChange={onChange} />
    </section>
  );
}
