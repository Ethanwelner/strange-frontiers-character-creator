import type { Draft } from "../draft.js";
import { KindCards } from "./KindCards.js";
import { LevelStepper, LooksFields, StepHeader } from "./ui.js";

interface Props {
  draft: Draft;
  startingLevel: number;
  onChange: (d: Draft) => void;
  onStartingLevel: (level: number) => void;
}

// The character's name, the level the campaign starts it at, its age and gender, and its Kind.
export function CharacterStep({ draft, startingLevel, onChange, onStartingLevel }: Props) {
  return (
    <section>
      <StepHeader step="character" title="Character">
        Name your character, set the level your campaign starts at, and choose a Kind. Age and gender are up to you; the rules don't use them. Your GM sets the level; most campaigns start at 3.
        A Kind adds a bonus to each stat and sets how far each can go; numbers show bonus/max.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box character-fields">
        <label className="field name-field">
          <span className="field-label">Character Name</span>
          <input value={draft.name ?? ""} placeholder="Unnamed character" onChange={(e) => onChange({ ...draft, name: e.target.value || undefined })} />
        </label>
        {/* The describe box's Level control */}
        <LevelStepper label="Starting Level" level={startingLevel} onChange={onStartingLevel} />
        <div className="looks-fields">
          <LooksFields looks={draft} onChange={(looks) => onChange({ ...draft, ...looks })} fieldClass="field name-field" />
        </div>
      </div>
      <KindCards draft={draft} onChange={onChange} />
    </section>
  );
}
