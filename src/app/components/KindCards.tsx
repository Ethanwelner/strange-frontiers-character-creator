import { content } from "../content.js";
import type { Draft } from "../draft.js";
import { title } from "./ui.js";
import { KindCard } from "./cards.js";

// Kinds are listed by where they come from: Earth's Kinds are The Settled Systems',
// and the rest go under their region. The Settled Systems come first, then Dreft.
const ORDER = ["systems", "dreft"];
const REGION_TITLE: Record<string, string> = { systems: "The Settled Systems", dreft: "Dreft" };
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
                <KindCard key={k.id} kind={k} className="kind-card" select={{ selected: draft.kind === k.id, onSelect: () => onChange({ ...draft, kind: draft.kind === k.id ? undefined : k.id, startPoints: undefined }) }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
