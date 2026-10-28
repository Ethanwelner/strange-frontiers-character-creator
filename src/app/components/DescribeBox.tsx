import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { DescribeError, DescribeEvent, DescribeResult, Progress } from "../../ai/types.js";
import { levelFromDescription } from "../../ai/level.js";
import { describeRemote } from "../../ai/remote.js";
import { content, kindById, packageById } from "../content.js";
import type { AiNotes, Draft } from "../draft.js";
import { askerName, choiceLabel, LevelStepper, title, traitName } from "./ui.js";

interface Props {
  draft: Draft;
  notes?: AiNotes;
  // Whether a build just finished, so its notes show
  showNotes: boolean;
  startingLevel: number;
  hasBuild: boolean;
  onBuilt: (result: DescribeResult, description: string, seconds: number, name?: string) => void;
  // New, to the right of Build it
  actions?: ReactNode;
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

interface BuildRequest {
  description: string;
  // The level the player set; a level in the description doesn't override it.
  level: number;
  name?: string;
}

// Ollama builds run on the local AI server, which streams progress back.
async function describeOnServer({ description, level, name }: BuildRequest, onProgress: (p: Progress) => void) {
  let res: Response;
  try {
    res = await fetch("api/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description, startingLevel: level, exactLevel: true, name }),
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
const requestBuild = (request: BuildRequest, onProgress: (p: Progress) => void) =>
  __SF_AI__.route === "browser"
    ? describeRemote({
        description: request.description,
        startingLevel: request.level,
        levelFromText: false,
        name: request.name,
        content,
        endpoint: __SF_AI__.endpoint,
        model: __SF_AI__.model,
        onProgress,
      })
    : describeOnServer(request, onProgress);

// 67 seconds as "1:07".
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

// Description placeholders, one picked per page load, covering each Kind and a
// spread of Origins and backgrounds.
const EXAMPLES = [
  "A goblin who failed out of the mage schools and now patches up caravan guards with whatever grows by the road.",
  "An orcoid Tatot mercenary from Karsef who guards caravans by day and gambles away the pay by night.",
  "A young Isek who ran away from a noble household to range the wild country past the Dreft border.",
  "A Guwain smuggler from the Glintl docks who knows every harbor inspector's price and every tavern on the coast.",
  "An Isek bard from Sorellion whose songs about the nobility mean leaving every town before morning.",
  "A Guwain squire whose knight died in the succession crisis, now sworn to whichever noble will feed them.",
  "A citizen shareholder of the Lunar Industrial Syndicate, a station rat turned starship engineer who can fix anything with a wrench and a grudge.",
  "A Texan truck pilot hauling cargo between the systems, with a pistol under the seat and a debt to the wrong people.",
  "An AI Core spy for the Empire of China who has worn a dozen bodies and trusts none of them.",
  "A university-educated paraecologist from the Kingdom of India, cataloguing Murk Legs on a newly opened plane.",
  "An officer of the Bureau of Planar Management and Enforcement from the Stellar Democratic Union, chasing smugglers through the switch gates.",
  "A Centafrican combat medic who served at a frontier gate and came home with steady hands and bad dreams.",
  "An interplanar rights lawyer from the Free American States who takes the parasapient cases nobody else will.",
  "A holding company kid from Tetra who quit the family business to explore new planes with the Explorers' Lodge.",
];

export function DescribeBox({ notes, showNotes, startingLevel, hasBuild, onBuilt, draft, actions }: Props) {
  const [text, setText] = useState(notes?.description ?? "");
  // A name for the builder to use, and the level to build at. Writing a level
  // in the description ("level 10") sets the stepper; the stepper has the last word.
  const [name, setName] = useState(notes?.name ?? "");
  const [level, setLevel] = useState(startingLevel);
  const [example] = useState(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);
  useEffect(() => setLevel(startingLevel), [startingLevel]);
  const describe = (value: string) => {
    setText(value);
    const asked = levelFromDescription(value);
    if (asked) setLevel(asked);
  };
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>();
  const [error, setError] = useState<string>();
  // Replacing a build asks inline; native confirm() dialogs are blocked in some browsers.
  const [confirming, setConfirming] = useState(false);
  // The stopwatch on Build it: when the build started, and seconds since.
  const started = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const secondsSince = () => Math.round((Date.now() - started.current) / 1000);

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
      const named = name.trim() || undefined;
      const body = await requestBuild({ description: text, level, name: named }, setProgress);
      if ("error" in body) throw new Error(body.message);
      if (!body.build) throw new Error("The model didn't propose a build. Try again, or describe the character differently.");
      // The player's name stands, whatever the model wrote.
      onBuilt(named ? { ...body, build: { ...body.build, name: named } } : body, text, secondsSince(), named);
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
        {/* The heading and what it's for, then the fields and Build it */}
        <div className="describe-intro">
          <h3 className="copy-title">Describe your character</h3>
          <p className="hint">
            Say who they are in your own words. The AI picks from the game's real Kinds, packages and Traits, the rules engine checks every
            choice, and you can change anything afterward.
          </p>
        </div>
        <div className="describe-controls">
          {/* Name with Level to its right, then Description under both */}
          <div className="describe-fields">
            <label className="describe-field describe-name">
              <span className="field-label">Character Name</span>
              <input
                className="rpg-search-input"
                value={name}
                maxLength={80}
                placeholder="Leave blank to let the builder name them"
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </label>
            <LevelStepper className="describe-level" label="Level" level={level} onChange={setLevel} disabled={busy} />
            <label className="describe-field describe-text">
              <span className="field-label">Description</span>
              <textarea
                className="rpg-search-input"
                value={text}
                rows={3}
                maxLength={4000}
                placeholder={`e.g. ${example}`}
                onChange={(e) => describe(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
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
            {actions}
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

      {notes && showNotes && !busy && (
        <div className="describe-result">
          <p className={`describe-status ${notes.status === "accepted" ? "good" : "bad"}`}>
            {notes.seconds !== undefined && <strong>Build finished in {clock(notes.seconds)}. </strong>}
            {notes.status === "accepted"
              ? "Built from your description. Edit anything below; the panel keeps checking."
              : "The builder ran out of turns before the build was legal. The panel shows what's left to fix."}
          </p>
          {notes.summary && <p>{notes.summary}</p>}
          {/* The reasons for each choice, folded away in the site's Details box */}
          <details className="lore-details">
            <summary className="line-container">
              <h5>
                <strong>Details</strong>
              </h5>
              <div className="line"></div>
            </summary>
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
          </details>
        </div>
      )}
    </section>
  );
}
