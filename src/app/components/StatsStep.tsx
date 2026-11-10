import type { StatGroup } from "../../engine/build.js";
import { bonusPointsOf, MP_PER_MAGIC, FOCUS_POINTS_PER_LEVEL as POINTS_PER_LEVEL } from "../../engine/validate.js";
import { STAT_GROUPS, type StatId } from "../../schema/index.js";
import { coreAccessFor, coreStatsShown } from "../check.js";
import { content, kindById, packageById } from "../content.js";
import { withCore, type Draft } from "../draft.js";
import { baseStats, FOCUS_GROUPS, GROUPS, StepHeader, title } from "./ui.js";
import { StatBlock } from "./stats.js";

interface Props {
  draft: Draft;
  onChange: (d: Draft) => void;
  // The character as it stood before a level up (Game Tools): its core and
  // focus points are fixed, so − only takes back what the new level added.
  floor?: Draft;
}

// Stats as a pool, drawn like the character sheet. Each core point (one
// per level) goes to a group and unlocks 3 focus points for that group's
// stats, which the player adds with each stat's + and −. The stats' circle and
// square bars show the result: the Kind's bonus in purple, then the player's
// points in green.
//
// A group's stats only take points its core stat has unlocked, so the player
// levels the core stat first, with +. A stat's + spends free bonus points
// first, if there are any it can take (an Origin's in its group, like the
// American Empire's 1 Physical point, then the Kind's in any stat; they need
// no core point), then the group's unlocked points. Taking a point back returns the group's points first,
// then the free ones; core points stay put until the player takes them
// back with −, which also takes back any focus points the group can no
// longer hold. A group can't take a core point its stats have no room
// for, like an AI Core's Physical, where every max is 0.
//
// Magic, for characters who can level it, has no focus stats: each core
// point in it adds MP instead.
export function StatsStep({ draft, onChange, floor }: Props) {
  const base = baseStats(draft);
  // Free bonus points: the Origin's and other packages', each in its group,
  // and the Kind's, in any stat.
  const packages = [draft.origin, draft.profession, draft.past].flatMap((id) => (id && packageById.get(id) ? [packageById.get(id)!] : []));
  const bonus = bonusPointsOf(draft.kind ? kindById.get(draft.kind) : undefined, packages);
  const start = draft.startPoints ?? {};
  const placedIn = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + (start[s] ?? 0), 0);
  const needIn = (g: StatGroup) => bonus.groups.find((b) => b.group === g)?.count ?? 0;
  const inGroups = bonus.groups.reduce((n, b) => n + Math.min(placedIn(b.group), b.count), 0);
  const placed = Object.values(start).reduce((n, p) => n + (p ?? 0), 0);
  const anyLeft = Math.max(0, bonus.any - (placed - inGroups));
  // Free points a group's stats can still take: its own, then the Kind's
  const freeFor = (g: StatGroup) => Math.max(0, needIn(g) - placedIn(g)) + anyLeft;
  const groupOf = (s: StatId) => (Object.keys(STAT_GROUPS) as StatGroup[]).find((g) => STAT_GROUPS[g].includes(s))!;
  const corePlaced = GROUPS.reduce((n, g) => n + draft.core[g], 0);
  const coreLeft = draft.level - corePlaced;
  const shown = coreStatsShown(draft, content);
  const open = coreAccessFor(draft, content);
  const spentIn = (g: StatGroup) => STAT_GROUPS[g].reduce((n, s) => n + (draft.points[s] ?? 0), 0);
  // Points any of a group's stats could still take: free bonus points, then
  // the group's unlocked points
  const spareIn = (g: StatGroup) => freeFor(g) + Math.max(0, draft.core[g] * POINTS_PER_LEVEL - spentIn(g));
  const kindBonus = (s: StatId) => base?.[s]?.bonus ?? 0;
  // The Kind's bonus plus any free bonus points placed on the stat
  const bonusOf = (s: StatId) => kindBonus(s) + (start[s] ?? 0);
  const valueOf = (s: StatId) => bonusOf(s) + (draft.points[s] ?? 0);
  // What a stat or core stat was before a level up; nothing goes below it.
  const floorOf = (s: StatId) => (floor ? kindBonus(s) + (floor.startPoints?.[s] ?? 0) + (floor.points[s] ?? 0) : kindBonus(s));
  const coreFloor = (g: StatGroup) => floor?.core[g] ?? 0;
  // Taking back a core point. On a level up, the group's stats go back to
  // where they were before it, rather than losing points from the last stat.
  const takeCore = (g: StatGroup) => {
    if (!floor) return onChange(withCore(draft, g, draft.core[g] - 1));
    const points = { ...draft.points };
    for (const s of STAT_GROUPS[g]) {
      if (floor.points[s]) points[s] = floor.points[s];
      else delete points[s];
    }
    onChange({ ...draft, core: { ...draft.core, [g]: draft.core[g] - 1 }, points });
  };

  // One point on or off a stat: on from the free bonus points while any are
  // left, otherwise from the group's unlocked points; off from the group's
  // points first.
  const bump = (s: StatId, by: 1 | -1) => {
    const startPoints = { ...start };
    const points = { ...draft.points };
    if (by > 0) {
      if (freeFor(groupOf(s)) > 0) startPoints[s] = (startPoints[s] ?? 0) + 1;
      else points[s] = (points[s] ?? 0) + 1;
    } else if (points[s]) points[s] -= 1;
    else if (startPoints[s]) startPoints[s] -= 1;
    if (!startPoints[s]) delete startPoints[s];
    if (!points[s]) delete points[s];
    onChange({ ...draft, startPoints, points });
  };

  // A package's Magic bonus, like the Licensed Mage's 1 Magic, on top of the levels
  const extraOf = (g: StatGroup) =>
    !STAT_GROUPS[g].length && open.includes(g) ? packages.reduce((n, p) => n + (p.coreBonus[g as "magic"] ?? 0), 0) : 0;

  // A core stat's − and +, its count, and whether it's faded
  const coreControl = (g: StatGroup) => {
    const core = draft.core[g];
    const take = { onClick: () => takeCore(g), disabled: core <= coreFloor(g) };
    if (!STAT_GROUPS[g].length) {
      // Magic: each point adds MP, so its count is its MP
      const canLevel = coreLeft > 0 && open.includes(g);
      const total = core + extraOf(g);
      return {
        take,
        put: {
          onClick: () => onChange(withCore(draft, g, core + 1)),
          disabled: !canLevel,
          title: coreLeft > 0 && !open.includes(g) ? `This character can't Level ${title(g)}` : undefined,
        },
        count: { text: `${MP_PER_MAGIC * total} MP`, tone: total === 0 ? ("muted" as const) : ("mp" as const) },
        locked: core === 0 && !canLevel,
        hint: !open.includes(g) ? `This character can't Level ${title(g)}; take these points back.` : undefined,
      };
    }
    const room = core * POINTS_PER_LEVEL;
    const spent = spentIn(g);
    const spare = spareIn(g);
    // Room left under the group's maxes, after the points already unlocked.
    const headroom = STAT_GROUPS[g].reduce((n, s) => n + Math.max(0, (base![s]?.max ?? 0) - valueOf(s)), 0) - Math.max(0, room - spent);
    const canLevel = coreLeft > 0 && headroom >= POINTS_PER_LEVEL;
    // Focus points that taking a core point back also takes back
    const stranded = Math.max(0, spent - (core - 1) * POINTS_PER_LEVEL);
    return {
      take: { ...take, title: core > 0 && stranded ? `Also takes back ${stranded} focus ${stranded === 1 ? "point" : "points"}` : undefined },
      put: {
        onClick: () => onChange(withCore(draft, g, core + 1)),
        disabled: !canLevel,
        title: coreLeft > 0 && !canLevel ? `${title(g)}'s Stats have no room for ${POINTS_PER_LEVEL} more points` : undefined,
      },
      count: { text: `${spent}/${room}`, tone: core === 0 ? ("muted" as const) : spent === room ? ("good" as const) : spent > room ? ("bad" as const) : undefined },
      locked: spare === 0 && spent === 0,
      hint: core === 0 && !canLevel && headroom < POINTS_PER_LEVEL ? "These Stats have no room for points." : undefined,
    };
  };

  // A focus stat's − and +, and how many points it can still take
  const statControl = (s: StatId) => {
    const g = groupOf(s);
    const spare = spareIn(g);
    const value = valueOf(s);
    const max = base![s]?.max ?? 0;
    return {
      take: { onClick: () => bump(s, -1), disabled: value <= floorOf(s) },
      put: { onClick: () => bump(s, 1), disabled: spare === 0 || value >= max },
      // The group's unspent points this stat can still take under its max
      spend: Math.max(0, Math.min(spare, max - value)),
    };
  };

  if (!base) {
    return (
      <section>
        <StepHeader title="Stats" />
        <p className="empty">Choose a Kind first; it adds a bonus to each Stat and sets how far each can go.</p>
      </section>
    );
  }

  return (
    <section>
      <StepHeader title="Stats">
        Each level gives a core point. Level a group's core stat with the + beside its number to unlock {POINTS_PER_LEVEL} focus points for its
        stats, then spend them with each stat's +. A group's stats can't take points until its core stat is leveled. Your stats start at 0, and your Kind's bonus
        is added on top, in purple; your points show in green.
      </StepHeader>
      <div className="tech-fields tech-fields-light step-box">
        {floor ? (
          // Leveling up in Player Tools: only what's left to place, and how
          <ul className="pool-summary pool-left">
            {coreLeft > 0 && (
              <li>
                <span className="num">{coreLeft}</span> core {coreLeft === 1 ? "point" : "points"} to place: Level a core Stat with the + beside its number.
              </li>
            )}
            {FOCUS_GROUPS.map((g) => {
              const left = draft.core[g] * POINTS_PER_LEVEL - spentIn(g);
              return left > 0 ? (
                <li key={g}>
                  <span className="num">{left}</span> {title(g)} focus {left === 1 ? "point" : "points"} to spend with the + beside each {title(g)} Stat.
                </li>
              ) : null;
            })}
            {bonus.groups.map((b) => {
              const left = b.count - placedIn(b.group);
              return left > 0 ? (
                <li key={b.group}>
                  <span className="num">{left}</span> {title(b.group)} bonus {left === 1 ? "point" : "points"} from {b.from.join(" and ")} to place with the + beside a{" "}
                  {title(b.group)} stat.
                </li>
              ) : null;
            })}
            {anyLeft > 0 && (
              <li>
                <span className="num">{anyLeft}</span> free bonus {anyLeft === 1 ? "point" : "points"} to place with the + beside any Stat.
              </li>
            )}
            {coreLeft <= 0 && FOCUS_GROUPS.every((g) => spentIn(g) >= draft.core[g] * POINTS_PER_LEVEL) && bonus.groups.every((b) => placedIn(b.group) >= b.count) && anyLeft <= 0 && (
              <li className="good">Every point is placed. Submit to keep them.</li>
            )}
          </ul>
        ) : (
          <p className="pool-summary">
            <span className={`num${coreLeft === 0 ? " good" : coreLeft < 0 ? " bad" : ""}`}>
              {corePlaced}/{draft.level}
            </span>{" "}
            core points placed
            {coreLeft > 0 && <span className="muted"> · {coreLeft} left</span>}
            {bonus.groups.map((b) => (
              <span key={b.group}>
                {" · "}
                <span className={`num${placedIn(b.group) >= b.count ? " good" : ""}`}>
                  {Math.min(placedIn(b.group), b.count)}/{b.count}
                </span>{" "}
                {title(b.group)} bonus {b.count === 1 ? "point" : "points"} placed
                <span className="muted"> (from {b.from.join(" and ")}, spent first)</span>
              </span>
            ))}
            {bonus.any > 0 && (
              <>
                {" · "}
                <span className={`num${anyLeft === 0 ? " good" : ""}`}>
                  {bonus.any - anyLeft}/{bonus.any}
                </span>{" "}
                free bonus points placed
                <span className="muted"> (spent first, on any Stat)</span>
              </>
            )}
          </p>
        )}

        {/* The groups, one under the next, as the stat block with its − and + */}
        <div className="pool-stats">
          <StatBlock
            groups={shown.map((g) => ({
              group: g,
              core: draft.core[g] + extraOf(g),
              bonus: extraOf(g),
              stats: STAT_GROUPS[g].map((s: StatId) => ({ id: s, value: valueOf(s), bonus: bonusOf(s), max: base[s]?.max ?? 0 })),
            }))}
            edit={{ core: coreControl, stat: statControl }}
          />
        </div>
      </div>
    </section>
  );
}
