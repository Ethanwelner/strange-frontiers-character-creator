import type { Draft } from "../draft.js";
import { KindCards } from "./KindCards.js";
import { LevelStepper, LooksFields, Portrait, StepHeader } from "./ui.js";

interface Props {
  draft: Draft;
  startingLevel: number;
  onChange: (d: Draft) => void;
  onStartingLevel: (level: number) => void;
}

// The character's portrait, name, the level the campaign starts it at, its age, gender, height and weight, and its Kind.
export function CharacterStep({ draft, startingLevel, onChange, onStartingLevel }: Props) {
  return (
    <section>
      <StepHeader title="Character">
        Name your character, set the level your campaign starts at, and choose a Kind. Age, gender, height, weight and a portrait are up to you; the rules don't use them. Your GM sets the level; most campaigns start at 3.
        A Kind adds a bonus to each stat and sets how far each can go; numbers show bonus/max.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box character-fields">
        <Portrait className="character-portrait" portrait={draft.portrait} onChange={(portrait) => onChange({ ...draft, portrait })} />
        {/* The describe box's Level control, above the name */}
        <LevelStepper label="Starting Level" level={startingLevel} onChange={onStartingLevel} />
        <label className="field name-field">
          <span className="field-label">Character Name</span>
          <input value={draft.name ?? ""} placeholder="Unnamed character" onChange={(e) => onChange({ ...draft, name: e.target.value || undefined })} />
        </label>
        <div className="looks-fields">
          <LooksFields looks={draft} onChange={(looks) => onChange({ ...draft, ...looks })} fieldClass="field name-field" />
        </div>
      </div>
      <KindCards draft={draft} onChange={onChange} />
    </section>
  );
}
