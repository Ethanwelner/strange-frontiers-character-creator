import { useState, type ReactNode } from "react";
import { Button } from "./Button.js";
import { Popup } from "./popup.js";
import { StepHeader } from "./ui.js";

// The first step: build from a description (the describe form, passed in from
// App.tsx, in a popup), or go to the Character step and build it by hand.
// A finished build moves to the Sheet, which closes the popup with this step.
export function StartStep({ describe, onManual }: { describe: ReactNode; onManual: () => void }) {
  const [describing, setDescribing] = useState(false);
  return (
    <div className="start-step">
      <StepHeader title="Start">
        Build from a description: say who your character is in your own words, and the AI picks from the game's real Kinds, packages
        and Traits while the rules engine checks every choice. Or build manually, choosing each part yourself, step by step: Character,
        Background, Stats, Traits and Choices. Either way, you can change anything afterward.
      </StepHeader>
      <div className="start-choices">
        <Button tone="primary" onClick={() => setDescribing(true)}>
          Build From Description
        </Button>
        <span className="start-or">or</span>
        <Button onClick={onManual}>Build Manually</Button>
      </div>
      {describing && (
        <Popup label="Build From Description" onClose={() => setDescribing(false)} className="describe-popup">
          {describe}
        </Popup>
      )}
    </div>
  );
}
