import { content } from "../content.js";
import type { Draft } from "../draft.js";
import { Card, Chip, regionClass, SettingIcon, StatRanges, title, traitName } from "./ui.js";

// Kinds are listed by where they come from: Earth's Kinds are The Systems',
// and the rest go under their region. The Systems come first, then Dreft.
const ORDER = ["systems", "dreft"];
const REGION_TITLE: Record<string, string> = { systems: "The Systems", dreft: "Dreft" };
const regionOf = (k: (typeof content.kinds)[number]) => k.region ?? (k.plane === "earth" ? "systems" : k.plane);
const rank = (r: string) => (ORDER.includes(r) ? ORDER.indexOf(r) : ORDER.length);
const regions = [...new Set(content.kinds.map(regionOf))].sort((a, b) => rank(a) - rank(b));

// The Kind cards, in their own box on the Character step
export function KindCards({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  return (
    <div className="tech-fields tech-fields-light step-box">
      <div role="radiogroup" aria-label="Kind">
        {regions.map((region) => (
          <div key={region} className="kind-group">
            <h3 className="subhead">{REGION_TITLE[region] ?? title(region)}</h3>
            <div className="cards">
              {content.kinds.filter((k) => regionOf(k) === region).map((k) => (
                <Card key={k.id} className={`kind-card headed ${regionClass(k.plane)}`} label={k.name} selected={draft.kind === k.id} onSelect={() => onChange({ ...draft, kind: draft.kind === k.id ? undefined : k.id, startPoints: undefined })}>
                  <div className="card-head">
                    <h3>
                      <SettingIcon plane={k.plane} />
                      {k.name}
                    </h3>
                    <Chip tone="muted">{k.plane}</Chip>
                  </div>
                  <p>{k.summary}</p>
                  {/* Bonus and max for every stat, then the grants and features */}
                  <StatRanges stats={k.stats} />
                  {/* Traits every character of the Kind holds, like the packages' Grants */}
                  {k.grants.length > 0 && (
                    <div className="grants">
                      <div>
                        <span className="label">Grants</span>
                        {k.grants.map((g) => (
                          <Chip key={g.trait} tone="accent">
                            {traitName(g.trait)}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}
                  <ul className="features">
                    {k.features.map((f) => (
                      <li key={f.name}>
                        <strong>{f.name}.</strong> {f.description}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
