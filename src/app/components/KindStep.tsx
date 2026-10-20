import { content } from "../content.js";
import type { Draft } from "../draft.js";
import { Card, Chip, StatRanges, StepHeader, title } from "./ui.js";

// Kinds are listed by where they come from: Earth's Kinds are The Systems',
// and the rest go under their region. The Systems come first, then Dreft.
const ORDER = ["systems", "dreft"];
const REGION_TITLE: Record<string, string> = { systems: "The Systems", dreft: "Dreft" };
const regionOf = (k: (typeof content.kinds)[number]) => k.region ?? (k.plane === "earth" ? "systems" : k.plane);
const rank = (r: string) => (ORDER.includes(r) ? ORDER.indexOf(r) : ORDER.length);
const regions = [...new Set(content.kinds.map(regionOf))].sort((a, b) => rank(a) - rank(b));

export function KindStep({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  return (
    <section>
      <StepHeader step="kind" title="Kind">
        Your Kind sets your level 0 stats and how far each can go. Numbers show start/max.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
        <div role="radiogroup" aria-label="Kind">
          {regions.map((region) => (
            <div key={region} className="kind-group">
              <h3 className="subhead">{REGION_TITLE[region] ?? title(region)}</h3>
              <div className="cards">
                {content.kinds.filter((k) => regionOf(k) === region).map((k) => (
                  <Card key={k.id} label={k.name} selected={draft.kind === k.id} onSelect={() => onChange({ ...draft, kind: draft.kind === k.id ? undefined : k.id, startPoints: undefined })}>
                    <div className="card-head">
                      <h3>{k.name}</h3>
                      <Chip tone="muted">{k.plane}</Chip>
                    </div>
                    <p>{k.summary}</p>
                    <ul className="features">
                      {k.features.map((f) => (
                        <li key={f.name}>
                          <strong>{f.name}.</strong> {f.description}
                        </li>
                      ))}
                    </ul>
                    <StatRanges stats={k.stats} />
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
