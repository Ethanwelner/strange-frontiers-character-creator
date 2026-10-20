// Everything the UI knows about legality comes from validateBuild. These
// helpers only ask it questions; none of them re-implement a rule.
import type { Campaign, PickKind } from "../engine/build.js";
import type { Content } from "../engine/parse.js";
import { validateBuild, type BuildResult, type Issue } from "../engine/validate.js";
import type { Trait } from "../schema/index.js";
import { addPick, toBuild, type Draft, type Step } from "./draft.js";

export function check(draft: Draft, content: Content, campaign: Campaign): BuildResult {
  return validateBuild(toBuild(draft), content, campaign);
}

export interface TraitOption {
  trait: Trait;
  // The rank this pick would buy.
  rank: number;
  // Why the engine would reject it. Empty when the pick is legal.
  reasons: string[];
}

// The Traits a pick of this type could go on, each tried against the engine.
// A Trait is left out when the engine says it needs the other kind of pick;
// it's kept but given reasons when the engine rejects it for anything else.
// A Trait's own choices, like which language an Additional Language is, are
// answered on the Choices step afterward, so they don't count against it.
// Undefined until the build is complete enough for the engine to check.
export function traitOptions(draft: Draft, content: Content, campaign: Campaign, pick: PickKind): TraitOption[] | undefined {
  const base = check(draft, content, campaign);
  if (!base.summary) return undefined;
  const before = new Set(base.errors.map((e) => e.message));
  const held = new Map(base.summary.traits.map((h) => [h.trait, h.rank]));
  const options: TraitOption[] = [];
  for (const trait of content.traits) {
    // Non-ranked Traits are only ever bought at rank 1; the engine explains a duplicate.
    const rank = trait.ranked ? (held.get(trait.id) ?? 0) + 1 : 1;
    const trial = check(addPick(draft, trait.id, rank, pick), content, campaign);
    const ownChoice = `${trait.name} asks for `;
    const added = trial.errors.filter((e) => !before.has(e.message) && !(e.code === "choice" && e.message.startsWith(ownChoice)));
    // A Conveyed Trait can't be picked at all, and the wrong kind of pick is the other tab's.
    if (added.some((e) => e.code === "pick-type" || e.code === "conveyed")) continue;
    options.push({ trait, rank, reasons: added.map((e) => e.message) });
  }
  return options;
}

// Which step of the builder an engine issue belongs to.
export function stepOf(issue: Issue): Step {
  switch (issue.code) {
    case "kind":
      return "kind";
    case "package":
      return "background";
    case "level":
    case "allocation":
    case "stat-max":
    case "stat-cap":
      return "stats";
    case "choice":
    case "choice-pool":
      return "choices";
    case "schema": {
      const field = issue.path?.split(".")[0];
      if (field === "kind") return "kind";
      if (field === "origin" || field === "profession" || field === "past") return "background";
      if (field === "level" || field === "levels" || field === "startPoints") return "stats";
      if (field === "choices") return "choices";
      return "traits";
    }
    default:
      return issue.path === "choices" || issue.path?.startsWith("choices[") ? "choices" : "traits";
  }
}

const MISSING: Record<string, string> = {
  kind: "Choose a Kind",
  origin: "Choose an Origin",
  profession: "Choose a Profession",
  past: "Choose a Past",
};

// Schema errors for a field that hasn't been picked yet read as "expected
// string, received undefined"; say what to do instead.
export function describe(issue: Issue, draft: Draft): string {
  if (issue.code === "schema" && issue.path && issue.path in MISSING && !draft[issue.path as keyof Draft]) {
    return MISSING[issue.path]!;
  }
  return issue.message;
}
