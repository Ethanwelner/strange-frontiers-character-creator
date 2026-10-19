import { useState, type FormEvent } from "react";
import type { DescribeError, DescribeEvent, DescribeResult, Progress } from "../../ai/types.js";
import { kindById, packageById } from "../content.js";
import type { AiNotes, Draft } from "../draft.js";
import { title, traitName } from "./ui.js";

interface Props {
  draft: Draft;
  notes?: AiNotes;
  startingLevel: number;
  hasBuild: boolean;
  onBuilt: (result: DescribeResult, description: string) => void;
  onDismiss: () => void;
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
  if (target === "form") {
    const form = kindById.get(draft.kind ?? "")?.forms?.find((f) => f.id === draft.form);
    return `Form: ${form?.name ?? draft.form}`;
  }
  if (target === "origin" || target === "profession" || target === "past") {
    const id = draft[target];
    return `${title(target)}: ${packageById.get(id ?? "")?.name ?? id}`;
  }
  if (target === "levels") return "Stats";
  if (target.startsWith("choice:")) {
    const [pkg, from] = target.slice("choice:".length).split("/");
    return `${packageById.get(pkg ?? "")?.name ?? pkg} choice (${from})`;
  }
  return traitName(target);
}

export function DescribeBox({ notes, startingLevel, hasBuild, onBuilt, onDismiss, draft }: Props) {
  const [text, setText] = useState(notes?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>();
  const [error, setError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    if (hasBuild && !window.confirm("Replace the current build with a new one from this description?")) return;
    setBusy(true);
    setError(undefined);
    setProgress(undefined);
    try {
      const res = await fetch("api/describe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: text, startingLevel }),
      });
      const body = await readReply(res, setProgress);
      if (!body) throw new Error(`The AI server answered ${res.status} with no details. Is npm run dev running?`);
      if ("error" in body) throw new Error(body.message);
      if (!body.build) throw new Error("The model didn't propose a build. Try again, or describe the character differently.");
      onBuilt(body, text);
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn't reach the AI server. Start it with npm run dev." : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="describe" aria-label="Describe your character">
      <form onSubmit={submit}>
        <label htmlFor="describe-text">
          <h3>Describe your character</h3>
        </label>
        <p className="hint">
          Say who they are in your own words. The AI picks from the game's real Kinds, packages and Traits, the rules engine checks every
          choice, and you can change anything afterward.
        </p>
        <textarea
          id="describe-text"
          value={text}
          rows={3}
          maxLength={4000}
          placeholder="e.g. A goblin who failed out of the mage schools and now patches up caravan guards with whatever grows by the road."
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <div className="describe-actions">
          <button type="submit" className="primary" disabled={busy || !text.trim()} aria-busy={busy}>
            {busy ? "Building…" : "Build it"}
          </button>
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

      {notes && !busy && (
        <div className="describe-result">
          <div className="describe-head">
            <p className={`describe-status ${notes.status === "accepted" ? "good" : "bad"}`}>
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
              {notes.openChoices.map((c) => `${c.note ?? `${c.count} from ${c.from}`} (${packageById.get(c.package)?.name ?? c.package})`).join("; ")}.
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
      )}
    </section>
  );
}
