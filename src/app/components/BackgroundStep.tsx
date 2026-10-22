import type { BackgroundPackage } from "../../schema/index.js";
import { content } from "../content.js";
import type { Draft } from "../draft.js";
import { Card, Chip, regionClass, SettingIcon, StepHeader, title, traitName } from "./ui.js";

const SLOTS = ["origin", "profession", "past"] as const;

const BLURB = {
  origin: "Where you're from.",
  profession: "What you do for a living.",
  past: "What shaped you before the story starts.",
};

export function PackageGrants({ pkg }: { pkg: BackgroundPackage }) {
  return (
    <div className="grants">
      {pkg.grants.length > 0 && (
        <div>
          <span className="label">Grants</span>
          {pkg.grants.map((g) => (
            <Chip key={g.trait} tone="accent">
              {traitName(g.trait)}
              {g.rank ? ` ${g.rank}` : ""}
            </Chip>
          ))}
        </div>
      )}
      {pkg.choices.length > 0 && (
        <div>
          <span className="label">Choose</span>
          {pkg.choices.map((c, i) => (
            <Chip key={i}>{c.note ?? `${c.choose} from ${c.from}`}</Chip>
          ))}
        </div>
      )}
      {pkg.backgroundTraits.length > 0 && (
        <div>
          <span className="label">Background list</span>
          {pkg.backgroundTraits.map((t) => (
            <Chip key={t}>{traitName(t)}</Chip>
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
                      <h3>
                        <SettingIcon plane={p.plane} />
                        {p.name}
                      </h3>
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
