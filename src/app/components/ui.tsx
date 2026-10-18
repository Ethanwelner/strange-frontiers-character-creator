import type { KeyboardEvent, ReactNode } from "react";
import { STAT_GROUPS, type StatBlock, type StatId } from "../../schema/index.js";
import { kindById, traitById } from "../content.js";
import type { Draft } from "../draft.js";

export const GROUPS = Object.keys(STAT_GROUPS) as (keyof typeof STAT_GROUPS)[];

export const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const traitName = (id: string) => traitById.get(id)?.name ?? id;

// The Kind's (or form's) level 0 stats and maximums, straight from content.
export function baseStats(draft: Draft): StatBlock | undefined {
  const kind = draft.kind ? kindById.get(draft.kind) : undefined;
  if (!kind) return undefined;
  if (kind.forms) return kind.forms.find((f) => f.id === draft.form)?.stats;
  return kind.stats;
}

// A selectable card in a radio group, clickable and keyboard-operable.
export function Card(props: { selected: boolean; onSelect: () => void; children: ReactNode; label: string }) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      props.onSelect();
    }
  };
  return (
    <div
      role="radio"
      aria-checked={props.selected}
      aria-label={props.label}
      tabIndex={0}
      className={`card${props.selected ? " selected" : ""}`}
      onClick={props.onSelect}
      onKeyDown={onKey}
    >
      {props.children}
    </div>
  );
}

export function Chip(props: { children: ReactNode; tone?: "accent" | "muted" | "bad" }) {
  return <span className={`chip${props.tone ? ` chip-${props.tone}` : ""}`}>{props.children}</span>;
}

// Start and max for every stat, grouped Physical / Social / Mental.
export function StatRanges({ stats }: { stats: StatBlock }) {
  return (
    <div className="stat-ranges">
      {GROUPS.map((g) => (
        <div key={g}>
          <div className="stat-ranges-group">{title(g)}</div>
          {STAT_GROUPS[g].map((s: StatId) => (
            <div key={s} className="stat-range">
              <span>{title(s)}</span>
              <span className="num">
                {stats[s]?.start}
                <span className="muted">/{stats[s]?.max}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
