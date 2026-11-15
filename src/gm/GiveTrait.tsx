// The Game Master giving a player's character a Trait: every Trait in the
// game but the Conditions (which come and go in Player Tools), found by name,
// summary or tag and narrowed by category. A Trait the character holds that
// is ranked goes up a rank; one that isn't can't be given again. It costs
// the character no pick, and its requirements don't apply: that's the Game
// Master's call.
import { useMemo, useState } from "react";
import { content } from "../app/content.js";
import { Popup } from "../app/components/popup.js";
import { StepHeader, title } from "../app/components/ui.js";
import { Button } from "../app/components/Button.js";
import { TraitCategory } from "../schema/index.js";

// So a vague search doesn't fill the popup
const SHOWN = 60;

export function GiveTrait({
  name,
  held,
  onGive,
  onClose,
}: {
  // The character's name
  name: string;
  // The Traits the character holds, and their ranks
  held: Map<string, number>;
  onGive: (trait: string, rank: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = TraitCategory.options.filter((c) => c !== "condition");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return content.traits.filter(
      (t) =>
        t.category !== "condition" &&
        (category === "all" || t.category === category) &&
        (!q || t.name.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q))),
    );
  }, [query, category]);

  return (
    <Popup label={`Give ${name} a Trait`} onClose={onClose} size="wide" scroll="inner" className="gm-give-popup">
      <StepHeader title={`Give ${name} a Trait`} />
      <p className="gm-give-hint">It costs {name} no pick, and its requirements don't apply. Their Player Tools adds it the next time it checks in.</p>
      <div className="gm-give-filters">
        <input type="search" className="gm-give-search" placeholder="Search by name, summary or tag" aria-label="Search Traits" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Every category</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {title(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="sf-popup-grow">
        <ul className="gm-give-list">
          {matches.slice(0, SHOWN).map((t) => {
            const rank = held.get(t.id);
            const next = rank === undefined ? 1 : rank + 1;
            const can = rank === undefined || t.ranked;
            return (
              <li key={t.id} className="gm-give-row">
                <div className="gm-give-text">
                  <strong>{t.name}</strong>
                  <span className="gm-give-category">
                    {title(t.category)}
                    {rank !== undefined ? ` · held${t.ranked ? ` at rank ${rank}` : ""}` : ""}
                  </span>
                  <p>{t.summary}</p>
                </div>
                <Button size="small" tone={can ? "primary" : "gray"} disabled={!can} onClick={() => onGive(t.id, next)}>
                  {rank === undefined ? "Give" : t.ranked ? `Raise to ${next}` : "Held"}
                </Button>
              </li>
            );
          })}
        </ul>
        {matches.length > SHOWN && <p className="gm-give-more">{matches.length - SHOWN} more: narrow the search to see them.</p>}
        {matches.length === 0 && <p className="gm-give-more">No Traits match.</p>}
      </div>
    </Popup>
  );
}
