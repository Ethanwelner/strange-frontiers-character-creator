import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { check, stepOf } from "./check.js";
import { BackgroundStep } from "./components/BackgroundStep.js";
import { ChoicesStep } from "./components/ChoicesStep.js";
import { KindStep } from "./components/KindStep.js";
import { LevelsStep } from "./components/LevelsStep.js";
import { Sheet } from "./components/Sheet.js";
import { TraitsStep } from "./components/TraitsStep.js";
import { ValidationPanel } from "./components/ValidationPanel.js";
import { content, contentErrors } from "./content.js";
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

  const reset = () => {
    if (!window.confirm("Start a new character? The current build will be cleared.")) return;
    clearSaved();
    setSaved(EMPTY);
    setNotice(undefined);
  };

  const i = STEPS.indexOf(step);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand-mark">Strange Frontiers</span>
          <span className="brand-sub">Character Builder</span>
        </div>
        <input
          className="name"
          value={draft.name ?? ""}
          placeholder="Character name"
          aria-label="Character name"
          onChange={(e) => setDraft({ ...draft, name: e.target.value || undefined })}
        />
        <div className="actions">
          <button onClick={exportBuild}>Export</button>
          <button onClick={() => fileInput.current?.click()}>Import</button>
          <button onClick={reset}>New</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importBuild} />
        </div>
      </header>

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

      <nav className="steps" aria-label="Steps">
        {STEPS.map((s, n) => (
          <button key={s} className={s === step ? "on" : ""} aria-current={s === step ? "step" : undefined} onClick={() => setStep(s)}>
            <span className="step-n">{n + 1}</span> {LABELS[s]}
            {counts[s] ? <span className="badge">{counts[s]}</span> : null}
          </button>
        ))}
      </nav>

      <div className="layout">
        <main>
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
        <ValidationPanel draft={draft} result={result} onJump={setStep} />
      </div>
    </div>
  );
}
