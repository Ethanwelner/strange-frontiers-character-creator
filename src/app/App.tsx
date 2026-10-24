import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { check, describe, stepOf } from "./check.js";
import { BackgroundStep } from "./components/BackgroundStep.js";
import { CharacterStep } from "./components/CharacterStep.js";
import { ChoicesStep } from "./components/ChoicesStep.js";
import { DescribeBox } from "./components/DescribeBox.js";
import { KindStep } from "./components/KindStep.js";
import { StatsStep } from "./components/StatsStep.js";
import { Sheet } from "./components/Sheet.js";
import { TraitsStep } from "./components/TraitsStep.js";
import { StepErrors } from "./components/ui.js";
import { ValidationPanel } from "./components/ValidationPanel.js";
import { content, contentErrors } from "./content.js";
import type { DescribeResult } from "../ai/types.js";
import { clearSaved, EMPTY, fromBuild, load, save, slug, STEPS, toBuild, withLevel, type Draft, type Saved, type Step } from "./draft.js";

const LABELS: Record<Step, string> = {
  character: "Character",
  kind: "Kind",
  background: "Background",
  stats: "Stats",
  traits: "Traits",
  choices: "Choices",
  sheet: "Sheet",
};

export function App() {
  const [saved, setSaved] = useState<Saved>(load);
  const [notice, setNotice] = useState<string>();
  // New asks inline before clearing; native confirm() dialogs are blocked in some browsers.
  const [confirmingNew, setConfirmingNew] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { draft, campaign, step } = saved;

  useEffect(() => save(saved), [saved]);

  const result = useMemo(() => check(draft, content, campaign), [draft, campaign]);
  const counts = useMemo(() => {
    const n: Partial<Record<Step, number>> = {};
    for (const e of result.errors) n[stepOf(e)] = (n[stepOf(e)] ?? 0) + 1;
    return n;
  }, [result]);

  // The current step's errors, shown under its header.
  const stepErrors = useMemo(() => result.errors.filter((e) => stepOf(e) === step).map((e) => describe(e, draft)), [result, step, draft]);

  const setDraft = (d: Draft) => setSaved((s) => ({ ...s, draft: d }));
  const setStep = (st: Step) => {
    setSaved((s) => ({ ...s, step: st }));
    window.scrollTo({ top: 0 });
  };
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
      setSaved((s) => ({ ...s, draft: imported, campaign: { startingLevel: imported.level } }));
      setNotice(`Imported ${file.name}.`);
    } catch (err) {
      setNotice(`Couldn't import ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // The model's build replaces the draft, then stays editable like any other.
  // The build's level becomes the starting level, since the description can ask for one.
  const applyDescribed = (result: DescribeResult, description: string, seconds: number, name?: string) => {
    const built = fromBuild(result.build);
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
    clearSaved();
    setSaved(EMPTY);
    setNotice(undefined);
  };

  const i = STEPS.indexOf(step);

  return (
    <div className="sf-creator">
      <header className="builder-hero">
        <div className="container hero-bar">
          <button className="hero-link" onClick={exportBuild}>Export</button>
          <button className="hero-link" onClick={() => fileInput.current?.click()}>Import</button>
          {confirmingNew ? (
            <span className="hero-confirm">
              Clear this build?
              <button className="hero-link" onClick={reset}>Yes</button>
              <button className="hero-link" onClick={() => setConfirmingNew(false)}>Cancel</button>
            </span>
          ) : (
            <button className="hero-link" onClick={() => setConfirmingNew(true)}>New</button>
          )}
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importBuild} />
        </div>
        <div className="container d-flex flex-gap-48 builder-row">
          <div className="flex-11 builder-main hero-main">
            <div className="builder-statement">
              <h1 className="title hero-title frontiers-accent">Strange Frontiers</h1>
              <p className="title section-title">Character Builder</p>
            </div>

            <DescribeBox
              draft={draft}
              notes={saved.ai}
              startingLevel={campaign.startingLevel}
              hasBuild={Boolean(draft.kind || draft.origin || draft.profession || draft.past || draft.traits.length)}
              onBuilt={applyDescribed}
              onDismiss={() => setSaved((s) => ({ ...s, ai: undefined }))}
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
                  {counts[s] ? <span className="badge">{counts[s]}</span> : null}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex-3 builder-side">
            <ValidationPanel draft={draft} result={result} />
          </div>
        </div>
      </header>

      <div className="section unlimited white-bg builder-panel">
        <div className="container">
          <main>
            <StepErrors.Provider value={stepErrors}>
              {contentErrors.length > 0 && (
                <div className="notice bad">
                  Content failed to load: {contentErrors.join("; ")}
                </div>
              )}
              {notice && (
                <div className="notice" role="status">
                  {notice}
                  <button className="link" onClick={() => setNotice(undefined)} aria-label="Dismiss">
                    ✕
                  </button>
                </div>
              )}

              {step === "character" && (
                <CharacterStep draft={draft} startingLevel={campaign.startingLevel} onChange={setDraft} onStartingLevel={setStartingLevel} />
              )}
              {step === "kind" && <KindStep draft={draft} onChange={setDraft} />}
              {step === "background" && <BackgroundStep draft={draft} onChange={setDraft} />}
              {step === "stats" && (
                <StatsStep draft={draft} onChange={setDraft} />
              )}
              {step === "choices" && <ChoicesStep draft={draft} result={result} onChange={setDraft} />}
              {step === "traits" && <TraitsStep draft={draft} campaign={campaign} result={result} onChange={setDraft} />}
              {step === "sheet" && <Sheet draft={draft} result={result} />}

              <div className="pager">
                {i > 0 ? <button onClick={() => setStep(STEPS[i - 1]!)}>← {LABELS[STEPS[i - 1]!]}</button> : <span />}
                {i < STEPS.length - 1 && (
                  <button className="primary" onClick={() => setStep(STEPS[i + 1]!)}>
                    {LABELS[STEPS[i + 1]!]} →
                  </button>
                )}
              </div>
            </StepErrors.Provider>
          </main>
        </div>
      </div>
    </div>
  );
}
