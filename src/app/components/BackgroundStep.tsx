import { useEffect, useState } from "react";
import type { BackgroundPackage } from "../../schema/index.js";
import { content, packageById } from "../content.js";
import type { Draft } from "../draft.js";
import { Card, Chip, choiceLabel, regionClass, SettingIcon, Sign, StepHeader, title, traitName } from "./ui.js";

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
      {pkg.bonusPoints.length > 0 && (
        <div>
          <span className="label">Bonus</span>
          {pkg.bonusPoints.map((b) => (
            <Chip key={b.group} tone="accent">
              +{b.count} {title(b.group)} {b.count === 1 ? "point" : "points"}
            </Chip>
          ))}
        </div>
      )}
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

type Slot = (typeof SLOTS)[number];

export function BackgroundStep({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  // Each slot folds away once it has a package, showing the pick in its
  // heading, and opens again from there. Whenever a slot's package changes,
  // by a click, an import or a build, it folds if it has one and opens if not.
  const [open, setOpen] = useState<Record<Slot, boolean>>(() => ({ origin: !draft.origin, profession: !draft.profession, past: !draft.past }));
  const setSlotOpen = (slot: Slot, value: boolean) => setOpen((o) => (o[slot] === value ? o : { ...o, [slot]: value }));
  useEffect(() => setSlotOpen("origin", !draft.origin), [draft.origin]);
  useEffect(() => setSlotOpen("profession", !draft.profession), [draft.profession]);
  useEffect(() => setSlotOpen("past", !draft.past), [draft.past]);
  // Clicking the chosen package again clears the slot.
  const choose = (slot: Slot, id: string) => {
    const old = draft[slot];
    const next = old === id ? undefined : id;
    // Answers to the old package's choices no longer apply, and bonus points
    // placed for either package start over.
    const bonusChanged = [old, next].some((p) => p && packageById.get(p)?.bonusPoints.length);
    onChange({
      ...draft,
      [slot]: next,
      choices: draft.choices.filter((c) => c.package !== old),
      ...(bonusChanged ? { startPoints: undefined } : {}),
    });
  };
  return (
    <section>
      <StepHeader step="background" title="Background">
        Pick an Origin, a Profession and a Past. Their Traits come free and don't use picks.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
        {SLOTS.map((slot) => (
          <details key={slot} className="slot" open={open[slot]} onToggle={(e) => setSlotOpen(slot, e.currentTarget.open)}>
            <summary>
              <h3 className="subhead">
                {title(slot)}{" "}
                {draft[slot] ? <span className="slot-pick">{packageById.get(draft[slot])?.name ?? draft[slot]}</span> : <span className="muted">{BLURB[slot]}</span>}
                <span className="slot-toggle" aria-hidden="true">
                  <Sign is={open[slot] ? "minus" : "plus"} />
                </span>
              </h3>
            </summary>
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
          </details>
        ))}
      </div>
    </section>
  );
}
