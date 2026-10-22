import type { BackgroundPackage } from "../../schema/index.js";
import { content } from "../content.js";
import type { Draft } from "../draft.js";
import { Card, Chip, choiceLabel, regionClass, StepHeader, title, traitName } from "./ui.js";

const SLOTS = ["origin", "profession", "past"] as const;

const BLURB = {
  origin: "Where you're from.",
  profession: "What you do for a living.",
  past: "What shaped you before the story starts.",
};

// A language's spoken and written forms as one chip, "English (Spoken & Written)",
// in place of two. Everything else keeps its own chip, with its rank.
function chipLabels(entries: { trait: string; rank?: number }[]): string[] {
  const names = entries.map((e) => traitName(e.trait) + (e.rank ? ` ${e.rank}` : ""));
  const labels: string[] = [];
  for (const name of names) {
    const base = name.match(/^(.*) \((Spoken|Written)\)$/)?.[1];
    const both = base !== undefined && names.includes(`${base} (Spoken)`) && names.includes(`${base} (Written)`);
    const label = both ? `${base} (Spoken & Written)` : name;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

export function PackageGrants({ pkg }: { pkg: BackgroundPackage }) {
  return (
    <div className="grants">
      {pkg.grants.length > 0 && (
        <div>
          <span className="label">Grants</span>
          {chipLabels(pkg.grants).map((label) => (
            <Chip key={label} tone="accent">
              {label}
            </Chip>
          ))}
        </div>
      )}
      {pkg.choices.length > 0 && (
        <div>
          <span className="label">Choose</span>
          {pkg.choices.map((c, i) => (
            <Chip key={i}>{c.note ?? choiceLabel(c.choose, c.from)}</Chip>
          ))}
        </div>
      )}
      {pkg.backgroundTraits.length > 0 && (
        <div>
          <span className="label">Background list</span>
          {chipLabels(pkg.backgroundTraits.map((trait) => ({ trait }))).map((label) => (
            <Chip key={label}>{label}</Chip>
          ))}
        </div>
      )}
      {pkg.features.map((f) => (
        <p key={f.name}>
          <strong>{f.name}.</strong> {f.description}
        </p>
      ))}
    </div>
  );
}

export function BackgroundStep({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  // Clicking the chosen package again clears the slot.
  const choose = (slot: (typeof SLOTS)[number], id: string) => {
    const old = draft[slot];
    // Answers to the old package's choices no longer apply.
    onChange({ ...draft, [slot]: old === id ? undefined : id, choices: draft.choices.filter((c) => c.package !== old) });
  };
  return (
    <section>
      <StepHeader step="background" title="Background">
        Pick an Origin, a Profession and a Past. Their Traits come free and don't use picks.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
        {SLOTS.map((slot) => (
          <div key={slot} className="slot">
            <h3 className="subhead">
              {title(slot)} <span className="muted">{BLURB[slot]}</span>
            </h3>
            <div className="cards" role="radiogroup" aria-label={title(slot)}>
              {content.packages
                .filter((p) => p.type === slot)
                .map((p) => (
                  <Card key={p.id} className={`headed ${regionClass(p.plane)}`} label={p.name} selected={draft[slot] === p.id} onSelect={() => choose(slot, p.id)}>
                    <div className="card-head">
                      <h3>{p.name}</h3>
                      <Chip tone="muted">{p.plane}</Chip>
                    </div>
                    <p>{p.summary}</p>
                    <PackageGrants pkg={p} />
                  </Card>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
