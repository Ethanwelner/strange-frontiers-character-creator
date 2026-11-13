import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./ui.js";

// The character sheet's layout: the sheet's lighter box with the level's
// blob on its corner, then its darker boxes, each in its place. One
// component, so the sheets can't drift apart.
//
// Player Tools' sheet is the reference. The creator's Sheet step draws this
// layout too, and the site draws the same markup from
// php/rpg/components/sheet.php (sf_sheet_layout), styled by the same
// stylesheet: src/app/sheet.css here, css/sf-sheet.css (a copy) there.
//
//   level      the blob on the corner, and what sits on its corner
//   head       the portrait and name, then the description
//   resources  HP, VP, SP and MP
//   stats      the stat block
//   side       Movement and the resistances, over the Conditions and Items
//   lower      the Knowledges beside the Languages, then the Abilities
//              beside the Skills, then any other Traits, contacts and
//              features
//
// The layout fills each box with what it's handed. Each sheet's context
// (play, build or sample, under the same names on both sides) sets rules
// for what it draws there, by where it sits in Strange Frontiers and how
// players use it:
//
//   play    Player Tools, at the table: the character as it is right now.
//           Level up on the blob's corner; Download, Switch and any rules
//           problems over the sheet; HP and the rest live, with their
//           controls; the stats editable while there are points to place;
//           Conditions and Items changed as play goes; Add traits for the
//           picks banked.
//   build   The Character Creator's Sheet step: the character as built,
//           before play. No level up (the Stats step levels), no play
//           actions (its Download, Import and Print sit over the sheet);
//           resources at full; each stat's maximum beside it; the name,
//           portrait, description, starting Conditions and Items editable;
//           picks left shown, spent in the Traits step.
//   sample  The site's sample sheet, a finished character to read: all of
//           it, as it would look in play, with nothing to change. Resources
//           at full, each stat's maximum, cards and links that open.
//
// A slot a context doesn't allow isn't drawn, even when it's handed one.
// The site's pages are static, so only sample exists there.

export type SheetContext = "play" | "build" | "sample";

export interface SheetRules {
  // Level up, on the blob's corner
  levelUp: boolean;
  // Download, Switch and the rules problems, over the sheet
  actions: boolean;
  // HP and the rest: "live" with their controls, or "full" at their maximums
  resources: "live" | "full";
  // Each stat's maximum beside its number
  statMax: boolean;
  // The stats' − and + while there are points to place
  statEdit: boolean;
  // Name, portrait, description, Conditions and Items changed in place
  edit: boolean;
  // Add traits, beside the picks left
  addTraits: boolean;
}

export const SHEET_RULES: Record<SheetContext, SheetRules> = {
  play: { levelUp: true, actions: true, resources: "live", statMax: false, statEdit: true, edit: true, addTraits: true },
  build: { levelUp: false, actions: false, resources: "full", statMax: true, statEdit: false, edit: true, addTraits: false },
  sample: { levelUp: false, actions: false, resources: "full", statMax: true, statEdit: false, edit: false, addTraits: false },
};

// A box's ruled title, with anything along its line after the rule
export function SheetTitle({ children, aside, as: Tag = "h3", icon }: { children: ReactNode; aside?: ReactNode; as?: "h3" | "h4"; icon?: "knowledge" | "language" }) {
  const title = (
    <Tag className="sf-sheet-title">
      {icon ? (
        // The section's kind as an icon before its name, like its cards'
        <span className="sf-sheet-title-label">
          <Icon name={icon} className="sf-sheet-title-icon" />
          {children}
        </span>
      ) : (
        children
      )}
    </Tag>
  );
  if (!aside) return title;
  return (
    <div className="sf-sheet-title-row">
      {title}
      {aside}
    </div>
  );
}

// HP, VP, SP and MP at their maximums (build and sample), each name in its
// color with its full name on hover
export const RESOURCE_NAMES = { hp: "Hit Points", vp: "Vibe Points", sp: "Savvy Points", mp: "Mana Points", core: "Core HP (an AI Core's own, apart from its chassis's)" } as const;

export function FullResources({ resources }: { resources: { id: keyof typeof RESOURCE_NAMES; max?: number }[] }) {
  return (
    <ul className="sf-resources">
      {resources.map(({ id, max }) => (
        <li key={id} className="sf-resource">
          <strong className={`sf-resource-name resource-${id}`} title={RESOURCE_NAMES[id]}>
            {id.toUpperCase()}
          </strong>
          <span className="sf-resource-value">
            {max ?? "–"}
            <span className="sf-resource-max"> / {max ?? "–"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Movement, from the Kind: a running figure, then the number running into
// its unit, "10m", the m in the titles' Bebas
function MoveBox({ movement }: { movement?: string }) {
  const parts = movement?.match(/^\s*([\d.]+)\s*([a-z]+)\s*$/i);
  return (
    <div className="sf-sheet-box sf-sheet-move">
      <SheetTitle>
        <span title="Movement">Move</span>
      </SheetTitle>
      <div className="sf-sheet-move-value" title="Movement">
        <Icon name="person-running" label="Movement" />
        <span className="sf-sheet-move-number">
          {parts ? (
            <>
              {parts[1]}
              <span className="sf-sheet-move-unit">{parts[2]}</span>
            </>
          ) : (
            (movement ?? "–")
          )}
        </span>
      </div>
    </div>
  );
}

export interface SheetLayoutProps {
  context: SheetContext;
  level: number;
  // On the blob's corner (play: Level up)
  corner?: ReactNode;
  // Over the sheet (play: Download, Switch and the rules problems)
  actions?: ReactNode;
  head: { who: ReactNode; description?: ReactNode };
  resources: ReactNode;
  stats: ReactNode;
  movement?: string;
  // The resistances' title and list
  resistances: ReactNode;
  // The Conditions' and the Items' title and list
  conditions: ReactNode;
  items: ReactNode;
  knowledges: ReactNode;
  languages: ReactNode;
  abilities: ReactNode;
  skills: ReactNode;
  // Along the Skills title's line: the picks left, and Add traits
  skillsAside?: ReactNode;
  // Other Traits, contacts and features, in a box of their own when there are any
  other?: ReactNode;
}

export function SheetLayout(props: SheetLayoutProps) {
  const { context, level, head, resources, stats, movement, resistances, conditions, items, knowledges, languages, abilities, skills, skillsAside, other } = props;
  const rules = SHEET_RULES[context];
  // Whether the side has wrapped under the stats, leaving a single column:
  // then Movement and the resistances go first, under the resources and over
  // the stats. Moving them doesn't change where the row wraps, so this
  // settles.
  const row = useRef<HTMLDivElement>(null);
  const [single, setSingle] = useState(false);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const check = () => {
      const s = el.querySelector(":scope > .sf-sheet-stats");
      const side = el.querySelector(":scope > .sf-sheet-side");
      if (s && side) setSingle(side.getBoundingClientRect().top > s.getBoundingClientRect().top + 1);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const moveRow = (
    <div className="sf-sheet-move-row">
      <MoveBox movement={movement} />
      <div className="sf-sheet-box sf-sheet-resistances">{resistances}</div>
    </div>
  );

  return (
    <div className={`sf-sheet sf-sheet--${context}`}>
      <div className="sf-sheet-level" aria-label={`Level ${level}`}>
        <span className="sf-sheet-level-label">Level</span>
        <span className="sf-sheet-level-number">{level}</span>
      </div>
      {rules.levelUp && props.corner && <div className="sf-sheet-corner">{props.corner}</div>}
      {rules.actions && props.actions}

      <div className="sf-sheet-box sf-sheet-head">
        <div className="sf-sheet-who">{head.who}</div>
        {head.description && <div className="sf-sheet-description">{head.description}</div>}
      </div>

      <div className="sf-sheet-box sf-sheet-resources">{resources}</div>

      <div className={`sf-sheet-row${single ? " is-single" : ""}`} ref={row}>
        {single && moveRow}
        <div className="sf-sheet-box sf-sheet-stats">{stats}</div>
        <div className="sf-sheet-side">
          {!single && moveRow}
          <div className="sf-sheet-side-row">
            <div className="sf-sheet-box sf-sheet-conditions">{conditions}</div>
            <div className="sf-sheet-box sf-sheet-items">{items}</div>
          </div>
        </div>
      </div>

      <div className="sf-sheet-lower">
        <div className="sf-sheet-pair sf-sheet-pair--lists">
          <div className="sf-sheet-box sf-sheet-knowledges">
            <SheetTitle icon="knowledge">Knowledges</SheetTitle>
            {knowledges}
          </div>
          <div className="sf-sheet-box sf-sheet-languages">
            <SheetTitle icon="language">Languages</SheetTitle>
            {languages}
          </div>
        </div>
        <div className="sf-sheet-pair">
          <div className="sf-sheet-box sf-sheet-abilities">
            <SheetTitle>Abilities</SheetTitle>
            {abilities}
          </div>
          <div className="sf-sheet-box sf-sheet-skills">
            <SheetTitle aside={skillsAside}>Skills</SheetTitle>
            {skills}
          </div>
        </div>
        {other && <div className="sf-sheet-box sf-sheet-other">{other}</div>}
      </div>
    </div>
  );
}
