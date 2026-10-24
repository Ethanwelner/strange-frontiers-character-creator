import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DescribeError, DescribeEvent, DescribeResult, Progress } from "../../ai/types.js";
import { describeRemote } from "../../ai/remote.js";
import { content, kindById, packageById } from "../content.js";
import type { AiNotes, Draft } from "../draft.js";
import { askerName, choiceLabel, title, traitName } from "./ui.js";

interface Props {
  draft: Draft;
  notes?: AiNotes;
  startingLevel: number;
  hasBuild: boolean;
  onBuilt: (result: DescribeResult, description: string, seconds: number) => void;
  // While a build runs, so the last build's notes can step aside.
  onBusyChange?: (busy: boolean) => void;
}

// A build streams progress lines, then a result or error line. Errors before
// the build starts come back as a single JSON reply.
async function readReply(res: Response, onProgress: (p: Progress) => void): Promise<DescribeResult | DescribeError | undefined> {
  if (!res.headers.get("content-type")?.includes("ndjson") || !res.body) {
    return (await res.json().catch(() => undefined)) as DescribeResult | DescribeError | undefined;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let final: DescribeResult | DescribeError | undefined;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as DescribeEvent;
    if (event.type === "progress") onProgress(event);
    else final = event.type === "result" ? event.result : event.error;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buffer);
  return final;
}

function targetLabel(target: string, draft: Draft): string {
  if (target === "kind") return `Kind: ${kindById.get(draft.kind ?? "")?.name ?? draft.kind}`;
  if (target === "origin" || target === "profession" || target === "past") {
    const id = draft[target];
    return `${title(target)}: ${packageById.get(id ?? "")?.name ?? id}`;
  }
  if (target === "levels") return "Stats";
  if (target.startsWith("choice:")) {
    const [asker, from] = target.slice("choice:".length).split("/");
    const name = packageById.get(asker ?? "")?.name ?? traitName(asker ?? "");
    return `${name} choice (${from})`;
  }
  return traitName(target);
}

// Ollama builds run on the local AI server, which streams progress back.
async function describeOnServer(description: string, startingLevel: number, onProgress: (p: Progress) => void) {
  let res: Response;
  try {
    res = await fetch("api/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description, startingLevel }),
    });
  } catch {
    throw new Error("Couldn't reach the AI server. Start it with npm run dev.");
  }
  const body = await readReply(res, onProgress);
  if (!body) throw new Error(`The AI server answered ${res.status} with no details. Is npm run dev running?`);
  return body;
}

// Claude builds run their loop here and send each turn to the endpoint that
// holds the key; Ollama builds run on the local AI server (see vite.config.ts).
const requestBuild = (description: string, startingLevel: number, onProgress: (p: Progress) => void) =>
  __SF_AI__.route === "browser"
    ? describeRemote({ description, startingLevel, content, endpoint: __SF_AI__.endpoint, model: __SF_AI__.model, onProgress })
    : describeOnServer(description, startingLevel, onProgress);

// 67 seconds as "1:07".
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function DescribeBox({ notes, startingLevel, hasBuild, onBuilt, onBusyChange }: Props) {
  const [text, setText] = useState(notes?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>();
  const [error, setError] = useState<string>();
  // Replacing a build asks inline; native confirm() dialogs are blocked in some browsers.
  const [confirming, setConfirming] = useState(false);
  // The stopwatch on Build it: when the build started, and seconds since.
  const started = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const secondsSince = () => Math.round((Date.now() - started.current) / 1000);

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  useEffect(() => {
    if (!busy) return;
    const tick = setInterval(() => setElapsed(secondsSince()), 1000);
    return () => clearInterval(tick);
  }, [busy]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    if (hasBuild && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    started.current = Date.now();
    setElapsed(0);
    setBusy(true);
    setError(undefined);
    setProgress(undefined);
    try {
      const body = await requestBuild(text, startingLevel, setProgress);
      if ("error" in body) throw new Error(body.message);
      if (!body.build) throw new Error("The model didn't propose a build. Try again, or describe the character differently.");
      onBuilt(body, text, secondsSince());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`${message} (after ${clock(secondsSince())})`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="describe" aria-label="Describe your character">
      <form onSubmit={submit}>
        <label htmlFor="describe-text">
          <h3 className="copy-title">Describe your character</h3>
        </label>
        <p className="hint">
          Say who they are in your own words. The AI picks from the game's real Kinds, packages and Traits, the rules engine checks every
          choice, and you can change anything afterward.
        </p>
        <textarea
          id="describe-text"
          className="rpg-search-input"
          value={text}
          rows={3}
          maxLength={4000}
          placeholder="e.g. A goblin who failed out of the mage schools and now patches up caravan guards with whatever grows by the road."
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <div className="describe-actions">
          <button type="submit" className="primary build-button" disabled={busy || !text.trim()} aria-busy={busy}>
            {busy ? (
              <>
                Building
                <span className="stopwatch-icon" aria-hidden="true" />
                <span className="num" aria-label={`${elapsed} seconds`}>
                  {clock(elapsed)}
                </span>
              </>
            ) : confirming ? (
              "Replace it"
            ) : (
              "Build it"
            )}
          </button>
          {confirming && (
            <>
              <span className="hint">This replaces the current build.</span>
              <button type="button" className="link" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          )}
          {busy && (
            <span className="describe-progress muted" title={progress?.status}>
              {progress ? `Turn ${progress.turn} of ${progress.maxTurns} · ${progress.status}` : "Starting…"}
            </span>
          )}
        </div>
      </form>

      {error && (
        <div className="notice bad" role="alert">
          {error}
          <button className="link" onClick={() => setError(undefined)} aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}
    </section>
  );
}

// What the last build from a description says: how it went, the character in
// a sentence or two, what's left for the player, and a reason for each choice.
// A column of its own in the hero, beside the describe box.
export function AiNotesColumn({ notes, draft, onDismiss }: { notes: AiNotes; draft: Draft; onDismiss: () => void }) {
  return (
    <div className="describe-result">
      <div className="describe-head">
        <p className={`describe-status ${notes.status === "accepted" ? "good" : "bad"}`}>
          {notes.seconds !== undefined && <strong>Build finished in {clock(notes.seconds)}. </strong>}
          {notes.status === "accepted"
            ? `Built from your description${notes.model ? ` by ${notes.model}` : ""}. Edit anything below; the panel keeps checking.`
            : `${notes.model ?? "The model"} ran out of turns before the build was legal. The panel shows what's left to fix.`}
        </p>
        <button className="link" onClick={onDismiss} aria-label="Hide the reasons">
          ✕
        </button>
      </div>
      {notes.summary && <p>{notes.summary}</p>}
      {notes.openChoices.length > 0 && (
        <p className="hint">
          Left for you on the Choices step:{" "}
          {notes.openChoices.map((c) => `${c.note ?? choiceLabel(c.count, c.from)} (${askerName(c)})`).join("; ")}.
        </p>
      )}
      <ul className="ai-reasons">
        {notes.reasons.map((r, i) => (
          <li key={i}>
            <strong>{targetLabel(r.target, draft)}</strong> {r.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
