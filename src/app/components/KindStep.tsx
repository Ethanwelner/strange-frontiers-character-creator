import { content } from "../content.js";
import type { Draft } from "../draft.js";
import { Card, Chip, StatRanges } from "./ui.js";

export function KindStep({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  return (
    <section>
      <h2>Kind</h2>
      <p className="lede">Your Kind sets your level 0 stats and how far each can go. Numbers show start/max.</p>
      <div className="cards" role="radiogroup" aria-label="Kind">
        {content.kinds.map((k) => (
          <Card key={k.id} label={k.name} selected={draft.kind === k.id} onSelect={() => onChange({ ...draft, kind: k.id })}>
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
    </section>
  );
}
