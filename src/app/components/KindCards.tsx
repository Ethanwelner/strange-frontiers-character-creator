import { content } from "../content.js";
import type { Draft } from "../draft.js";
import type { Kind } from "../../schema/index.js";
import { StatRanges, title, traitName } from "./ui.js";
import { BackgroundCard, BackgroundRows } from "./cards.js";

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
                <BackgroundCard key={k.id} name={k.name} slot="Kind" plane={k.plane} className="kind-card" select={{ selected: draft.kind === k.id, onSelect: () => onChange({ ...draft, kind: draft.kind === k.id ? undefined : k.id, startPoints: undefined }) }}>
                  <KindBody kind={k} />
                </BackgroundCard>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// A Kind card's body: its summary, the bonus and max for every stat, the
// Traits every character of the Kind holds (like the packages' Grants), then
// its features. `lore` adds the lore line, as in the popup.
export function KindBody({ kind: k, lore = false }: { kind: Kind; lore?: boolean }) {
  return (
    <>
      <p>{k.summary}</p>
      {lore && k.lore && <p className="sf-card-lore">{k.lore}</p>}
      <StatRanges stats={k.stats} />
      <BackgroundRows rows={[{ label: "Grants", accent: true, chips: k.grants.map((g) => traitName(g.trait)) }]} />
      <ul className="sf-card-features">
        {k.features.map((f) => (
          <li key={f.name}>
            <strong>{f.name}.</strong> {f.description}
          </li>
        ))}
      </ul>
    </>
  );
}
