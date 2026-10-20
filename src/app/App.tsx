import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { check, stepOf } from "./check.js";
import { BackgroundStep } from "./components/BackgroundStep.js";
import { ChoicesStep } from "./components/ChoicesStep.js";
import { DescribeBox } from "./components/DescribeBox.js";
import { KindStep } from "./components/KindStep.js";
import { LevelsStep } from "./components/LevelsStep.js";
import { Sheet } from "./components/Sheet.js";
import { TraitsStep } from "./components/TraitsStep.js";
import { ValidationPanel } from "./components/ValidationPanel.js";
import { content, contentErrors } from "./content.js";
import type { DescribeResult } from "../ai/types.js";
import { clearSaved, EMPTY, fromBuild, load, save, slug, STEPS, toBuild, withLevel, type Draft, type Saved, type Step } from "./draft.js";

const LABELS: Record<Step, string> = {
  kind: "Kind",
  background: "Background",
  levels: "Levels",
  choices: "Choices",
  traits: "Traits",
  sheet: "Sheet",
};

export function App() {
  const [saved, setSaved] = useState<Saved>(load);
  const [notice, setNotice] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const { draft, campaign, step } = saved;

  useEffect(() => save(saved), [saved]);

  const result = useMemo(() => check(draft, content, campaign), [draft, campaign]);
  const counts = useMemo(() => {
    const n: Partial<Record<Step, number>> = {};
    for (const e of result.errors) n[stepOf(e)] = (n[stepOf(e)] ?? 0) + 1;
    return n;
  }, [result]);

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
  const applyDescribed = (result: DescribeResult, description: string) => {
    const built = fromBuild(result.build);
    setSaved((s) => ({
      ...s,
      draft: built,
      step: "sheet",
      ai: {
        description,
        model: result.model,
        status: result.status,
        summary: result.summary,
        reasons: result.reasons,
        openChoices: result.check?.openChoices ?? [],
      },
    }));
    setNotice(undefined);
  };

  const reset = () => {
    if (!window.confirm("Start a new character? The current build will be cleared.")) return;
    clearSaved();
    setSaved(EMPTY);
    setNotice(undefined);
  };

  const i = STEPS.indexOf(step);

  // Rows use the site's 18-unit columns: flex-2 gutters (from 1200px) around the content.
  const gutter = <div className="flex-2 d-none d-xl-inline-flex" />;

  return (
    <div className="app">
      <header className="section builder-hero">
        <div className="container d-flex flex-wrap">
          {gutter}
          <div className="flex-14">
            <div className="hero-bar">
              <button className="hero-link" onClick={exportBuild}>Export</button>
              <button className="hero-link" onClick={() => fileInput.current?.click()}>Import</button>
              <button className="hero-link" onClick={reset}>New</button>
              <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importBuild} />
            </div>
            <div className="hero-statement">
              <h1 className="hero-title">Strange Frontiers</h1>
              <p className="hero-sub">Character Builder</p>
            </div>

            <DescribeBox
              draft={draft}
              notes={saved.ai}
              startingLevel={campaign.startingLevel}
              hasBuild={Boolean(draft.kind || draft.origin || draft.profession || draft.past || draft.traits.length)}
              onBuilt={applyDescribed}
              onDismiss={() => setSaved((s) => ({ ...s, ai: undefined }))}
            />
          </div>
          {gutter}
        </div>

        <div className="rpg-tabs">
          <div className="container d-flex">
            {gutter}
            <div className="flex-14">
              <nav className="rpg-tab-list" aria-label="Steps">
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
            {gutter}
          </div>
        </div>
      </header>

      <div className="section unlimited white-bg builder-panel">
        <div className="container d-flex flex-wrap">
          {gutter}
          <div className="flex-14 d-flex flex-gap-48 builder-row">
            <main className="flex-9 builder-main">
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

              {step !== "sheet" && (
                <input
                  className="name"
                  value={draft.name ?? ""}
                  placeholder="Character name"
                  aria-label="Character name"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value || undefined })}
                />
              )}
              <div className="stinger">
                Step {i + 1} of {STEPS.length}
              </div>

              {step === "kind" && <KindStep draft={draft} onChange={setDraft} />}
              {step === "background" && <BackgroundStep draft={draft} onChange={setDraft} />}
              {step === "levels" && (
                <LevelsStep draft={draft} startingLevel={campaign.startingLevel} result={result} onChange={setDraft} onStartingLevel={setStartingLevel} />
              )}
              {step === "choices" && <ChoicesStep draft={draft} onChange={setDraft} />}
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
            </main>
            <div className="flex-4 builder-side">
              <ValidationPanel draft={draft} result={result} onJump={setStep} />
            </div>
          </div>
          {gutter}
        </div>
      </div>
    </div>
  );
}
