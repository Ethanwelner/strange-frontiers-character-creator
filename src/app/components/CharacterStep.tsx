import type { Draft } from "../draft.js";
import { KindCards } from "./KindCards.js";
import { LevelStepper, StepHeader } from "./ui.js";

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
        A Kind adds a bonus to each stat and sets how far each can go; numbers show bonus/max.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box character-fields">
        <label className="field name-field">
          <span className="field-label">Character Name</span>
          <input value={draft.name ?? ""} placeholder="Unnamed character" onChange={(e) => onChange({ ...draft, name: e.target.value || undefined })} />
        </label>
        {/* The describe box's Level control */}
        <LevelStepper label="Starting Level" level={startingLevel} onChange={onStartingLevel} />
      </div>
      <KindCards draft={draft} onChange={onChange} />
    </section>
  );
}
