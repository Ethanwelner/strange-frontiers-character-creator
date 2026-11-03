import { useId, useMemo } from "react";
import { content } from "../content.js";
import { Icon } from "./ui.js";
import { DAMAGE_TYPES, resistancesOf, type DamageType } from "../resistances.js";
import type { Item } from "../items.js";

const icon = (t: DamageType) => (t === "Acidic/Corrosive" ? "acidic" : (t.toLowerCase() as Lowercase<Exclude<DamageType, "Acidic/Corrosive">>));

// The damage types from the Mechanics page that the character resists (or is
// weak to), in a line, each its icon then the total from everything in
// effect. Hovering or focusing one opens a popover listing each source, with
// the resistances that cover only part of the body or a moment (a helmet's
// head, a raised shield), which stay out of the total.
export function Resistances({ items, held }: { items: Item[]; held: { trait: string; rank: number }[] }) {
  const all = useMemo(() => resistancesOf(content, items, held), [items, held]);
  const id = useId();
  const shown = DAMAGE_TYPES.map((type) => {
    const own = all.filter((r) => r.type === type);
    return { type, own, total: own.filter((r) => !r.where).reduce((n, r) => n + r.amount, 0) };
  }).filter((t) => t.total !== 0 || t.own.some((r) => r.where && r.amount !== 0));
  return (
    <div className="sheet-resistances">
      <h3 className="subhead">Resistances</h3>
      {shown.length ? (
        <ul className="sheet-resistance-list">
          {shown.map(({ type, own, total }, i) => (
            <li key={type} className="sheet-resistance" tabIndex={0} aria-describedby={`${id}-${i}`}>
              <Icon name={icon(type)} label={type} />
              <span className="num">{total}</span>
              <div className="sheet-resistance-pop" role="tooltip" id={`${id}-${i}`}>
                <strong className="sheet-resistance-pop-title">
                  {type} {total}
                </strong>
                <ul>
                  {own.map((r, j) => (
                    <li key={j} className={r.where ? "is-partial" : undefined}>
                      <span>
                        {r.from}
                        {r.where && <span className="muted"> ({r.where})</span>}
                      </span>
                      <span className="num">{r.where && r.amount > 0 ? `+${r.amount}` : r.amount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">None.</p>
      )}
    </div>
  );
}
