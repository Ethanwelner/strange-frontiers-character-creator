import { useMemo, useState } from "react";
import type { Campaign, PickKind } from "../../engine/build.js";
import type { BuildResult } from "../../engine/validate.js";
import { TraitCategory } from "../../schema/index.js";
import { traitOptions } from "../check.js";
import { content, traitById } from "../content.js";
import { addPick, type Draft } from "../draft.js";
import { Chip, title, traitName } from "./ui.js";

interface Props {
  draft: Draft;
  campaign: Campaign;
  result: BuildResult;
  onChange: (d: Draft) => void;
}

const PICK_HELP: Record<PickKind, string> = {
  universal: "Universal picks take any Trait that isn't a Background Trait, knowledge included at creation.",
  background: "Background picks take only Traits on this character's Background Trait list.",
};

export function TraitsStep({ draft, campaign, result, onChange }: Props) {
  const [pick, setPick] = useState<PickKind>("universal");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [hideRejected, setHideRejected] = useState(false);

  const options = useMemo(() => traitOptions(draft, content, campaign, pick), [draft, campaign, pick]);
  const summary = result.summary;

  if (!options || !summary) {
    return (
      <section>
        <h2>Traits</h2>
        <p className="empty">Finish the Kind and Background steps first; the engine needs a complete build to check picks against.</p>
      </section>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = options.filter(
    (o) =>
      (!category || o.trait.category === category) &&
      (!hideRejected || o.reasons.length === 0) &&
      (!q || o.trait.name.toLowerCase().includes(q) || o.trait.tags.some((t) => t.toLowerCase().includes(q))),
  );
  const remove = (index: number) => onChange({ ...draft, traits: draft.traits.filter((_, i) => i !== index) });

  return (
    <section>
      <h2>Traits</h2>
      <p className="lede">Spend picks on Traits. Unspent picks are banked for later.</p>

      <div className="segmented" role="tablist" aria-label="Pick type">
        {(["universal", "background"] as const).map((k) => {
          const p = summary.picks[k];
          return (
            <button key={k} role="tab" aria-selected={pick === k} className={pick === k ? "on" : ""} onClick={() => setPick(k)}>
              {title(k)} <span className="num">{p.spent}/{p.available}</span>
            </button>
          );
        })}
      </div>
      <p className="hint">{PICK_HELP[pick]}</p>

      <div className="filters">
        <input type="search" placeholder="Search name or tag" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search Traits" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {TraitCategory.options.map((c) => (
            <option key={c} value={c}>
              {title(c)}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={hideRejected} onChange={(e) => setHideRejected(e.target.checked)} /> Hide unavailable
        </label>
      </div>

      {options.length === 0 && pick === "background" && (
        <p className="empty">This character's Background Trait list is empty. It grows from package background Traits and the Kind's Trait access.</p>
      )}
      {options.length > 0 && shown.length === 0 && (
        <p className="empty">{hideRejected ? "No available Traits match. Turn off Hide unavailable to see why the rest are out." : "No Traits match."}</p>
      )}

      <ul className="trait-list">
        {shown.map(({ trait: t, rank, reasons }) => {
          const rejected = reasons.length > 0;
          return (
            <li key={t.id} className={`trait${rejected ? " rejected" : ""}`}>
              <div className="trait-main">
                <div className="card-head">
                  <h3>{t.name}</h3>
                  <div className="chips">
                    <Chip tone="muted">{title(t.category)}</Chip>
                    {t.ranked && <Chip>Ranked</Chip>}
                    {t.background && <Chip>Background</Chip>}
                  </div>
                </div>
                <p>{t.summary}</p>
                <p className="effect">{t.effect}</p>
                {t.tags.length > 0 && <p className="tags">{t.tags.map((tag) => `#${tag}`).join(" ")}</p>}
                {rejected && (
                  <ul className="reasons">
                    {reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                className="take"
                disabled={rejected}
                aria-label={`Take ${t.name}${t.ranked || rank > 1 ? ` rank ${rank}` : ""} with a ${pick} pick`}
                onClick={() => onChange(addPick(draft, t.id, rank, pick))}
              >
                Take{t.ranked || rank > 1 ? ` rank ${rank}` : ""}
              </button>
            </li>
          );
        })}
      </ul>

      <h3 className="subhead">Picks spent</h3>
      {draft.traits.length === 0 ? (
        <p className="empty">No picks spent yet.</p>
      ) : (
        <ul className="picks">
          {draft.traits.map((p, i) => (
            <li key={i}>
              <span>
                <strong>{traitName(p.trait)}</strong> rank {p.rank ?? 1} <span className="muted">· {p.pick} pick</span>
                {!traitById.has(p.trait) && <Chip tone="bad">unknown</Chip>}
              </span>
              <button className="link" onClick={() => remove(i)} aria-label={`Remove ${traitName(p.trait)} rank ${p.rank ?? 1}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
