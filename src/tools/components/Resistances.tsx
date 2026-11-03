import { useMemo } from "react";
import { content } from "../../app/content.js";
import { Icon } from "../../app/components/ui.js";
import { DAMAGE_TYPES, resistancesOf, type DamageType } from "../../app/resistances.js";
import type { Item } from "../../app/items.js";

// Each damage type from the Mechanics page in a line, its icon then the
// character's total resistance to it from everything in effect. Resistances
// that cover only part of the body or a moment (a helmet's head, a raised
// shield) follow as a gray +, and every source shows on hover.
export function Resistances({ items, held }: { items: Item[]; held: { trait: string; rank: number }[] }) {
  const all = useMemo(() => resistancesOf(content, items, held), [items, held]);
  const icon = (t: DamageType) => (t === "Acidic/Corrosive" ? "acidic" : (t.toLowerCase() as Lowercase<Exclude<DamageType, "Acidic/Corrosive">>));
  return (
    <div className="tools-resistances">
      <h3 className="subhead">Resistances</h3>
      <ul className="tools-resistance-list">
        {DAMAGE_TYPES.map((t) => {
          const own = all.filter((r) => r.type === t);
          const total = own.filter((r) => !r.where).reduce((n, r) => n + r.amount, 0);
          const partial = own.filter((r) => r.where).reduce((n, r) => n + r.amount, 0);
          const sources = own.map((r) => `${r.amount} from ${r.from}${r.where ? ` (${r.where})` : ""}`);
          return (
            <li key={t} className={`tools-resistance${total || partial ? "" : " is-zero"}`} title={[t, ...sources].join("\n")}>
              <Icon name={icon(t)} label={t} />
              <span className="num">{total}</span>
              {partial > 0 && <span className="muted">+{partial}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
