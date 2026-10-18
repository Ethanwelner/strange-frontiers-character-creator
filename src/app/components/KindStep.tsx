import { content, kindById } from "../content.js";
import type { Draft } from "../draft.js";
import { Card, Chip, StatRanges } from "./ui.js";

export function KindStep({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const kind = draft.kind ? kindById.get(draft.kind) : undefined;
  return (
    <section>
      <h2>Kind</h2>
      <p className="lede">Your Kind sets your level 0 stats and how far each can go. Numbers show start/max.</p>
      <div className="cards" role="radiogroup" aria-label="Kind">
        {content.kinds.map((k) => (
          <Card key={k.id} label={k.name} selected={draft.kind === k.id} onSelect={() => onChange({ ...draft, kind: k.id, form: undefined })}>
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
            {k.stats && <StatRanges stats={k.stats} />}
            {k.forms && <p className="muted">Choose a form: {k.forms.map((f) => f.name).join(" or ")}.</p>}
          </Card>
        ))}
      </div>

      {kind?.forms && (
        <>
          <h3 className="subhead">{kind.name} form</h3>
          <div className="cards" role="radiogroup" aria-label={`${kind.name} form`}>
            {kind.forms.map((f) => (
              <Card key={f.id} label={f.name} selected={draft.form === f.id} onSelect={() => onChange({ ...draft, form: f.id })}>
                <h3>{f.name}</h3>
                <p>{f.description}</p>
                <StatRanges stats={f.stats} />
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
