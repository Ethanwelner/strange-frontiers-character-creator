import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Popup } from "./popup.js";
import { FREE_TEXT_POOLS, isFreeTextPool, type BuildResult } from "../../engine/validate.js";
import { coreStatsShown } from "../check.js";
import { sheetStatGroups, StatBlock } from "./stats.js";
import { content, itemById, kindById, packageById, traitById } from "../content.js";
import type { Draft, Looks } from "../draft.js";
import type { Item } from "../items.js";
import type { HeldCondition } from "../conditions.js";
import { CharacterLine } from "./CharacterLine.js";
import { Conditions } from "./Conditions.js";
import { Items } from "./Items.js";
import { askerName, DescriptionBox, Effect, Icon, NameField, Portrait, StepHeader, title, TraitAction, traitName } from "./ui.js";
import { FullResources, SHEET_RULES, SheetLayout, SheetTitle, type SheetContext } from "./sheet-layout.js";
import { Resistances } from "./Resistances.js";
import { CardChip, KIND_ICON, TraitCard, traitCardKind } from "./cards.js";
import { Button } from "./Button.js";

const SOURCE = /^(kind|origin|profession|past) ([a-z0-9-]+)( choice)?$/;
const TRAIT_CHOICE = /^trait ([a-z0-9-]+) choice$/;
const TRAIT_GRANT = /^trait ([a-z0-9-]+)$/;
const CHASSIS = /^chassis ([a-z0-9-]+)$/;

// "origin dreft" → "Dreft (origin)", "kind isek" → "Isek (kind)",
// "trait seafaring choice" →
// "Seafaring (choice)"; pick sources read as they are.
function source(s: string) {
  const t = TRAIT_CHOICE.exec(s);
  if (t) return `${traitName(t[1]!)} (choice)`;
  // Conveyed by another Trait, like Magic Access by Magical Heritage
  const g = TRAIT_GRANT.exec(s);
  if (g) return traitName(g[1]!);
  // Given by the chassis an AI Core inhabits
  const c = CHASSIS.exec(s);
  if (c) return itemById.get(c[1]!)?.name ?? c[1]!;
  const m = SOURCE.exec(s);
  if (!m) return s;
  const name = m[1] === "kind" ? kindById.get(m[2]!)?.name : packageById.get(m[2]!)?.name;
  return `${name ?? m[2]} (${m[1]}${m[3] ?? ""})`;
}

type Held = NonNullable<BuildResult["summary"]>["traits"][number];

// Where a held Trait came from, as badges: Origin, Profession or Past for a
// Trait selected from that package's choices in the Background step. A
// package's grants (a Knight's Wield: Longsword) come with it rather than
// being selected, and a Trait bought with a pick isn't one, even from a
// package's Background Keywords, so neither gets a badge; nor does the Kind's.
function sourceBadges(held: Held): string[] {
  const slots = new Set<string>();
  for (const s of held.sources) {
    const m = SOURCE.exec(s);
    if (m && m[1] !== "kind" && m[3]) slots.add(m[1]!);
  }
  return ["origin", "profession", "past"].filter((slot) => slots.has(slot)).map(title);
}

// A held Trait's card, with the badges for where it came from (a package's
// choice) at the right of the name's bar. Its category sits in its body, as
// a badge over the effect: the sheet's sections already sort the cards by it.
// `onToggle` makes it fold, a chevron at the end of the name's bar opening
// the body or closing the card back to that bar.
function HeldTraitCard({
  held,
  places,
  open = true,
  onToggle,
  keepEffect = false,
}: {
  held: Held;
  places: string[];
  draft?: Draft;
  open?: boolean;
  onToggle?: () => void;
  // An Ability's effect stays in view while closed; only its badge, where it
  // came from and the Action it grants fold away.
  keepEffect?: boolean;
}) {
  const t = traitById.get(held.trait);
  const name = traitName(held.trait);
  const badges = sourceBadges(held);
  const effect = t && <Effect text={t.effect} />;
  return (
    <TraitCard
      kind={traitCardKind(t)}
      name={name}
      rank={t?.ranked || held.rank > 1 ? held.rank : undefined}
      plane={t?.plane}
      chips={badges.length > 0 ? badges.map((b) => <CardChip key={b}>{b}</CardChip>) : undefined}
      fold={onToggle ? { open, onToggle, label: name } : undefined}
      keep={keepEffect ? effect : undefined}
    >
      {/* The category, then where the Trait came from, on one line */}
      <div className="sf-card-tags">
        {/* A Knowledge or Language says so with the icon in its bar */}
        {!t ? <CardChip tone="bad">not in content yet</CardChip> : !KIND_ICON[traitCardKind(t)] && <CardChip>{title(t.category)}</CardChip>}
        <span className="sf-card-note">From {held.sources.map(source).join(", ")}</span>
      </div>
      {!keepEffect && effect}
      <TraitAction action={t?.action} rank={held.rank} />
      {places.length > 0 && (
        <p className="small">
          <strong>{t?.choices.find((c) => c.from !== "contact" && isFreeTextPool(c.from))?.note ?? "Place"}:</strong> {places.join(", ")}
        </p>
      )}
    </TraitCard>
  );
}

// A Knowledge's or Language's card, opened from the sheet's lists in the site's lore popup.
function TraitModal({ held, places, draft, onClose }: { held: Held; places: string[]; draft: Draft; onClose: () => void }) {
  return (
    <Popup label={traitName(held.trait)} onClose={onClose} card>
      <HeldTraitCard held={held} places={places} draft={draft} />
    </Popup>
  );
}

// The character sheet, in the shared layout (sheet-layout.tsx), filled for
// its context: the creator's Sheet step (build) or Player Tools (play). The
// context's rules say what it draws; Player Tools hands in what only it has
// (its live resources, its stats editor, Level up and its actions).
// Knowledges and Languages are a list of links, each opening its card; the
// other Traits are cards.
export function Sheet({
  context,
  draft,
  result,
  onExport,
  onImport,
  onName,
  onLooks,
  onPortrait,
  onDescription,
  items,
  onItems,
  onCash,
  conditions,
  onConditions,
  hp,
  corner,
  actions,
  resources,
  stats,
  traitsAction,
}: {
  context: Exclude<SheetContext, "sample">;
  draft: Draft;
  result: BuildResult;
  // build: Download and Import, over the sheet
  onExport?: () => void;
  onImport?: () => void;
  onName: (name?: string) => void;
  onLooks: (looks: Looks) => void;
  onPortrait: (portrait?: string) => void;
  onDescription: (description?: string) => void;
  // The Conditions and the Items, with the current HP the Conditions go by
  // (full if not given)
  items: Item[];
  onItems: (items: Item[]) => void;
  // The character's money, by currency (draft.cash), changed from its badge
  onCash?: (cash: Record<string, number>) => void;
  conditions: HeldCondition[];
  onConditions: (conditions: HeldCondition[]) => void;
  hp?: number;
  // play: Level up, on the level's corner, and Download, Switch and the rules problems
  corner?: ReactNode;
  actions?: ReactNode;
  // play: the live resources, and the stats (the plain block, or the Stats step while placing points)
  resources?: ReactNode;
  stats?: ReactNode;
  // play: Add traits, beside the picks left
  traitsAction?: ReactNode;
}) {
  const rules = SHEET_RULES[context];
  const packages = [draft.origin, draft.profession, draft.past].map((id) => (id ? packageById.get(id) : undefined));
  const summary = result.summary;
  const groups = coreStatsShown(draft, content, result);
  // MP shows once the character can level Magic or has any.
  const shown = groups.includes("magic") || (summary?.resources.mp ?? 0) > 0 ? (["hp", "vp", "sp", "mp"] as const) : (["hp", "vp", "sp"] as const);
  // Contacts, as the player wrote them.
  const records = draft.choices.flatMap((c) =>
    c.from === "contact" ? c.traits.map((text) => ({ text, noun: FREE_TEXT_POOLS[c.from]!, from: askerName(c) })) : [],
  );
  // Places and the like go on their Trait's box, like "Which seas: the Mende
  // coast" or a Hunter's quarry. Contacts get their own list.
  const places = (trait: string) => draft.choices.filter((c) => c.trait === trait && c.from !== "contact" && isFreeTextPool(c.from)).flatMap((c) => c.traits);
  const held = useMemo(() => summary?.traits ?? [], [summary]);
  const isKnowledge = (h: Held) => traitById.get(h.trait)?.category === "knowledge";
  const isLanguage = (h: Held) => traitById.get(h.trait)?.category === "language";
  // Knowledges and Languages, each in a box of its own
  const knowledges = held.filter(isKnowledge);
  const languages = held.filter(isLanguage);
  const others = held.filter((h) => !isKnowledge(h) && !isLanguage(h));
  // The other Traits in a box per category: Skills, then Abilities, then any
  // left over (Circumstances and the like) in a box of their own
  const categoryOf = (h: Held) => traitById.get(h.trait)?.category;
  const skills = others.filter((h) => categoryOf(h) === "skill");
  const abilities = others.filter((h) => categoryOf(h) === "ability");
  const rest = others.filter((h) => categoryOf(h) !== "skill" && categoryOf(h) !== "ability");
  // Knowledges and Languages are a list of links, each opening its card
  const linkList = (list: Held[]) =>
    list.length > 0 ? (
      <ul className="sf-sheet-knowledge-list sf-sheet-scroll">
        {list.map((h) => {
          const t = traitById.get(h.trait);
          return (
            <li key={h.trait}>
              <Button kind="link" onClick={() => setOpen(h.trait)}>
                {traitName(h.trait)}
                {t?.ranked || h.rank > 1 ? ` (${h.rank})` : ""}
              </Button>
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="sf-sheet-empty">None yet.</p>
    );
  // Skills and Abilities open from their chevrons, like the item cards.
  // Closed, a Skill shows its name's bar alone and an Ability its name and
  // effect; open, both add the badge, where it came from and any Action.
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const toggleCard = (id: string) => {
    const next = new Set(openCards);
    if (!next.delete(id)) next.add(id);
    setOpenCards(next);
  };
  // The universal and background picks left, together
  const banked = summary ? summary.picks.universal.banked + summary.picks.background.banked : 0;
  const traitCards = (list: Held[], accordion = false, keepEffect = false) => (
    <ul className={`sf-sheet-traits${accordion ? " sf-sheet-scroll" : ""}`}>
      {list.map((h) => (
        <li key={h.trait}>
          <HeldTraitCard
            held={h}
            places={places(h.trait)}
            {...(accordion ? { open: openCards.has(h.trait), onToggle: () => toggleCard(h.trait) } : {})}
            keepEffect={keepEffect}
          />
        </li>
      ))}
    </ul>
  );
  const [open, setOpen] = useState<string>();
  const closeModal = useCallback(() => setOpen(undefined), []);
  const opened = held.find((h) => h.trait === open);
  // The packages' features, at the bottom
  const features = packages.flatMap((p) => (p?.features ?? []).map((f) => ({ ...f, from: p!.name })));
  // The resistances come from everything in effect: Traits, Conditions and Items
  const inEffect = useMemo(() => [...held, ...conditions], [held, conditions]);

  return (
    <section className={`sheet sheet--${context}`}>
      {context === "build" && (
        <>
          <StepHeader title="Sheet" />
          {/* Whether the build is legal, then Download, Import and Print, above the sheet */}
          <div className="sheet-actions">
            <span className={`status ${result.ok ? "good" : "bad"}`}>{result.ok ? "Legal" : `${result.errors.length} ${result.errors.length === 1 ? "error" : "errors"}`}</span>
            <Button onClick={onExport}>
              <Icon name="download" />
              Download
            </Button>
            <Button onClick={onImport}>
              <Icon name="upload" />
              Import
            </Button>
            <Button onClick={() => window.print()}>
              <Icon name="print" />
              Print
            </Button>
          </div>
        </>
      )}
      <SheetLayout
        context={context}
        level={draft.level}
        corner={corner}
        actions={actions}
        head={{
          who: (
            <>
              <Portrait className="sf-sheet-portrait" portrait={draft.portrait} name={draft.name} onChange={rules.edit ? onPortrait : undefined} />
              <div className="sf-sheet-main">
                <NameField className="sheet-name" heading="h2" name={draft.name} onChange={onName} />
                {/* Kind, age, gender, height, weight, Origin, Profession and Past */}
                <CharacterLine draft={draft} onLooks={onLooks} />
              </div>
            </>
          ),
          // Editable at any time; an AI build fills it with its summary
          description:
            rules.edit || draft.description ? <DescriptionBox description={draft.description} onChange={rules.edit ? onDescription : undefined} /> : undefined,
        }}
        resources={
          rules.resources === "live" && resources ? (
            resources
          ) : (
            <FullResources
              resources={[
                // A bodiless AI Core (in no chassis) has its core's HP alone
                ...shown.filter((r) => r !== "hp" || !summary?.coreHp || summary.chassis).map((r) => ({ id: r, max: summary?.resources[r] })),
                // An AI Core's own HP, apart from its chassis's
                ...(summary?.coreHp ? [{ id: "core" as const, max: summary.coreHp }] : []),
              ]}
            />
          )
        }
        stats={stats ?? <StatBlock max={rules.statMax} groups={sheetStatGroups(draft, result)} />}
        movement={summary?.movement}
        resistances={<Resistances items={items} held={inEffect} />}
        conditions={
          <Conditions conditions={conditions} hp={hp ?? summary?.resources.hp ?? 0} maxHp={summary?.resources.hp ?? 0} onChange={onConditions} />
        }
        items={
          <Items
            items={items}
            onChange={onItems}
            kit={context === "build" ? summary?.kit : undefined}
            cash={draft.cash}
            wealth={summary?.wealth}
            currency={summary?.kit.cash.currency}
            onCash={onCash}
          />
        }
        knowledges={linkList(knowledges)}
        languages={linkList(languages)}
        abilities={abilities.length > 0 ? traitCards(abilities, true, true) : <p className="sf-sheet-empty">No Abilities yet.</p>}
        skills={skills.length > 0 ? traitCards(skills, true) : <p className="sf-sheet-empty">No Skills yet.</p>}
        skillsAside={
          summary && (
            <>
              <span className="sf-sheet-aside">
                {banked} {banked === 1 ? "pick" : "picks"} available
              </span>
              {rules.addTraits && traitsAction}
            </>
          )
        }
        other={
          (rest.length > 0 || records.length > 0 || features.length > 0) && (
            <>
              {rest.length > 0 && (
                <>
                  <SheetTitle>Other Traits</SheetTitle>
                  {traitCards(rest)}
                </>
              )}
              {records.length > 0 && (
                <>
                  <SheetTitle>Contacts</SheetTitle>
                  <ul className="sf-sheet-features">
                    {records.map((r, i) => (
                      <li key={i}>
                        <strong>{r.text}</strong> <span className="sf-sheet-muted">({r.noun} from {r.from})</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {features.length > 0 && (
                <>
                  <SheetTitle>Features</SheetTitle>
                  <ul className="sf-sheet-features">
                    {features.map((f, i) => (
                      <li key={i}>
                        <strong>{f.name}</strong> <span className="sf-sheet-muted">({f.from})</span>. {f.description}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )
        }
      />
      {opened && <TraitModal held={opened} places={places(opened.trait)} draft={draft} onClose={closeModal} />}
    </section>
  );
}
