import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { check, describe, stepOf } from "./check.js";
import { BackgroundStep } from "./components/BackgroundStep.js";
import { CharacterStep } from "./components/CharacterStep.js";
import { ChoicesStep } from "./components/ChoicesStep.js";
import { DescribeBox } from "./components/DescribeBox.js";
import { StatsStep } from "./components/StatsStep.js";
import { Sheet } from "./components/Sheet.js";
import { TraitsStep } from "./components/TraitsStep.js";
import { Arrow, Notice } from "./components/ui.js";
import { ValidationPanel } from "./components/ValidationPanel.js";
import { content, contentErrors } from "./content.js";
import type { DescribeResult } from "../ai/types.js";
import { clearSaved, EMPTY, fromBuild, load, save, slug, STEPS, toBuild, withLevel, type Draft, type Saved, type Step } from "./draft.js";

const LABELS: Record<Step, string> = {
  character: "Character",
  background: "Background",
  stats: "Stats",
  traits: "Traits",
  choices: "Choices",
  sheet: "Sheet",
};

export function App() {
  const [saved, setSaved] = useState<Saved>(load);
  // The last build's notes show only right after it finishes, not after a reload
  // or an import. The saved notes still fill in the description and name.
  const [justBuilt, setJustBuilt] = useState(false);
  // A passing notice fades on its own; an error stays.
  const [notice, setNotice] = useState<{ text: string; fades?: boolean }>();
  // New asks inline before clearing; native confirm() dialogs are blocked in some browsers.
  const [confirmingNew, setConfirmingNew] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { draft, campaign, step } = saved;

  useEffect(() => save(saved), [saved]);

  const result = useMemo(() => check(draft, content, campaign), [draft, campaign]);
  // A step is done once it has nothing left to fix. Stats, Traits and Choices
  // also wait for Character and Background, since the engine doesn't check them
  // until a Kind and all three packages are picked. Traits also wants every
  // pick spent, though banking them is legal. The Sheet is done once the build
  // is legal, banked picks and all.
  const done = useMemo(() => {
    const wrong = new Set(result.errors.map(stepOf));
    const picks = result.summary?.picks;
    const spent = Boolean(picks) && Object.values(picks!).every((p) => p.banked === 0);
    const picked = !wrong.has("character") && !wrong.has("background");
    const d: Partial<Record<Step, boolean>> = {
      character: !wrong.has("character"),
      background: !wrong.has("background"),
      stats: picked && !wrong.has("stats"),
      traits: picked && !wrong.has("traits") && spent,
      choices: picked && !wrong.has("choices"),
    };
    d.sheet = Boolean(result.summary) && result.errors.length === 0;
    return d;
  }, [result]);

  // The current step's errors, shown beside the next step button.
  const stepErrors = useMemo(() => result.errors.filter((e) => stepOf(e) === step).map((e) => describe(e, draft)), [result, step, draft]);

  const setDraft = (d: Draft) => setSaved((s) => ({ ...s, draft: d }));
  // Changing steps keeps the page where it is.
  const setStep = (st: Step) => setSaved((s) => ({ ...s, step: st }));
  const setStartingLevel = (level: number) =>
    setSaved((s) => ({ ...s, campaign: { startingLevel: level }, draft: withLevel(s.draft, level) }));

  const exportBuild = () => {
    const json = JSON.stringify(toBuild(draft), null, 2);
    const url = URL.createObjectURL(new Blob([json + "\n"], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(draft.name ?? "") || "character"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBuild = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const imported = fromBuild(JSON.parse(await file.text()));
      // The imported level is taken as the campaign's starting level.
      // The last build's notes don't describe an imported sheet.
      setSaved((s) => ({ ...s, draft: imported, campaign: { startingLevel: imported.level }, ai: undefined }));
      setJustBuilt(false);
      setNotice({ text: `Imported ${file.name}.`, fades: true });
    } catch (err) {
      setNotice({ text: `Couldn't import ${file.name}: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  // The model's build replaces the draft, then stays editable like any other.
  // The build's level becomes the starting level, since the description can ask for one.
  const applyDescribed = (result: DescribeResult, description: string, seconds: number, name?: string) => {
    const built = fromBuild(result.build);
    setJustBuilt(true);
    setSaved((s) => ({
      ...s,
      draft: built,
      campaign: { startingLevel: built.level },
      step: "sheet",
      ai: {
        description,
        name,
        model: result.model,
        status: result.status,
        summary: result.summary,
        reasons: result.reasons,
        openChoices: result.check?.openChoices ?? [],
        seconds,
      },
    }));
    setNotice(undefined);
  };

  const reset = () => {
    setConfirmingNew(false);
    setJustBuilt(false);
    clearSaved();
    setSaved(EMPTY);
    setNotice(undefined);
  };

  const i = STEPS.indexOf(step);

  return (
    <div className="sf-creator">
      <header className="builder-hero">
        <div className="container d-flex builder-row">
          <div className="builder-main hero-main">
            <div className="builder-statement">
              <h1 className="title hero-title frontiers-accent frontiers-glitch" data-text="Strange Frontiers">
                Strange Frontiers
              </h1>
              <p className="title section-title">Character Builder</p>
            </div>

            <DescribeBox
              draft={draft}
              notes={saved.ai}
              showNotes={justBuilt}
              startingLevel={campaign.startingLevel}
              hasBuild={Boolean(draft.kind || draft.origin || draft.profession || draft.past || draft.traits.length)}
              onBuilt={applyDescribed}
              actions={
                <div className="hero-bar">
                  {confirmingNew ? (
                    <span className="hero-confirm">
                      Clear this build?
                      <button type="button" className="hero-link" onClick={reset}>
                        Yes
                      </button>
                      <button type="button" className="hero-link" onClick={() => setConfirmingNew(false)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="hero-link" onClick={() => setConfirmingNew(true)}>
                      New
                    </button>
                  )}
                  <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importBuild} />
                </div>
              }
            />

            <nav className="builder-tabs rpg-tab-list" aria-label="Steps">
              {STEPS.map((s, n) => (
                <button
                  key={s}
                  className={`rpg-tab${s === step ? " is-active" : ""}`}
                  aria-current={s === step ? "step" : undefined}
                  onClick={() => setStep(s)}
                >
                  <span className="step-n">{n + 1}</span> {LABELS[s]}
                  {done[s] && <span className="step-done" role="img" aria-label="done" />}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* The character box on the left, the step beside it. The Sheet already
          shows everything the box does, so it gets the full width. */}
      <div className="section unlimited white-bg builder-panel">
        <div className={`container builder-body${step === "sheet" ? " no-side" : ""}`}>
          {step !== "sheet" && (
            <aside className="builder-side">
              <ValidationPanel draft={draft} result={result} onName={(name) => setDraft({ ...draft, name })} />
            </aside>
          )}
          <main>
            <>
              {/* The previous and next steps, above the step's title, with what's
                  left to fix on this step to the left of the next one */}
              <div className="pager">
                {i > 0 ? <button onClick={() => setStep(STEPS[i - 1]!)}><Arrow to="left" /> {LABELS[STEPS[i - 1]!]}</button> : <span />}
                <div className="pager-next">
                  {stepErrors.length > 0 && (
                    <ul className="issues bad step-issues">
                      {stepErrors.map((e, n) => (
                        <li key={n}>{e}</li>
                      ))}
                    </ul>
                  )}
                  {i < STEPS.length - 1 && (
                    <button className={`step-next${done[step] ? " is-done" : ""}`} onClick={() => setStep(STEPS[i + 1]!)}>
                      {LABELS[STEPS[i + 1]!]} <Arrow to="right" />
                    </button>
                  )}
                </div>
              </div>
              {contentErrors.length > 0 && (
                <div className="notice bad">
                  Content failed to load: {contentErrors.join("; ")}
                </div>
              )}
              {notice && (
                <Notice fades={notice.fades} onDismiss={() => setNotice(undefined)}>
                  {notice.text}
                </Notice>
              )}

              {step === "character" && (
                <CharacterStep draft={draft} startingLevel={campaign.startingLevel} onChange={setDraft} onStartingLevel={setStartingLevel} />
              )}
              {step === "background" && <BackgroundStep draft={draft} onChange={setDraft} />}
              {step === "stats" && (
                <StatsStep draft={draft} onChange={setDraft} />
              )}
              {step === "choices" && <ChoicesStep draft={draft} result={result} onChange={setDraft} />}
              {step === "traits" && <TraitsStep draft={draft} campaign={campaign} result={result} onChange={setDraft} />}
              {step === "sheet" && <Sheet draft={draft} result={result} onExport={exportBuild} onImport={() => fileInput.current?.click()} onName={(name) => setDraft({ ...draft, name })} />}

            </>
          </main>
        </div>
      </div>
    </div>
  );
}
