import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { endpointCreate } from "../ai/remote.js";
import { content, contentErrors } from "../app/content.js";
import { slug, toBuild } from "../app/draft.js";
import { Notice } from "../app/components/ui.js";
import { checkPlay, creatorDraft, load, save, startPlay, type Play } from "./play.js";
import { Chat } from "./components/Chat.js";
import { Items } from "./components/Items.js";
import { LevelUp } from "./components/LevelUp.js";
import { Tracker } from "./components/Tracker.js";

// The character sheet sits under the Tracker, not on a tab of its own.
const TABS = ["tracker", "items", "level"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = { tracker: "Tracker", items: "Items", level: "Level Up" };

export function ToolsApp() {
  const [play, setPlay] = useState<Play | undefined>(load);
  const [tab, setTab] = useState<Tab>("tracker");
  // A passing notice fades on its own; an error stays.
  const [notice, setNotice] = useState<{ text: string; fades?: boolean }>();
  // Switching characters asks inline; native confirm() dialogs are blocked in some browsers.
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => save(play), [play]);

  const result = useMemo(() => (play ? checkPlay(play.draft, content) : undefined), [play?.draft]);
  const fromCreator = useMemo(() => (play ? undefined : creatorDraft()), [play]);

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPlay(startPlay(JSON.parse(await file.text())));
      setTab("tracker");
      setNotice({ text: `Imported ${file.name}.`, fades: true });
    } catch (err) {
      setNotice({ text: `Couldn't import ${file.name}: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  // The build as the Character Creator exports it, so it goes back there too.
  const exportBuild = () => {
    if (!play) return;
    const json = JSON.stringify(toBuild(play.draft), null, 2);
    const url = URL.createObjectURL(new Blob([json + "\n"], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(play.draft.name ?? "") || "character"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const create = useMemo(() => endpointCreate(__SF_AI__.toolsEndpoint), []);

  return (
    <div className="sf-creator sf-tools">
      <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importFile} />
      <header className="builder-hero">
        <div className="container d-flex builder-row">
          <div className="builder-main hero-main">
            <div className="builder-statement">
              <h1 className="title hero-title frontiers-accent frontiers-glitch" data-text="Strange Frontiers">
                Strange Frontiers
              </h1>
              <p className="title section-title">Game Tools</p>
            </div>
            {play && result && (
              <nav className="builder-tabs rpg-tab-list" aria-label="Game tools">
                {TABS.map((t) => (
                  <button key={t} className={`rpg-tab${t === tab ? " is-active" : ""}`} aria-current={t === tab ? "page" : undefined} onClick={() => setTab(t)}>
                    {LABELS[t]}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </div>
      </header>

      <div className="section unlimited white-bg builder-panel">
        <div className={`container builder-body tools-body${play ? "" : " no-side"}`}>
          {/* The character's name, titled like a tab, over the tools and the assistant, with its level under it */}
          {play && result && (
            <header className="step-head tools-character">
              <h2>{play.draft.name ?? "Unnamed character"}</h2>
              {/* "Level 3 Isek • Dreft • Licensed Mage • Expelled from the Mage Schools", then any rules problems */}
              <p className="tools-line">
                {[
                  `Level ${play.draft.level}${play.draft.kind ? ` ${content.kinds.find((k) => k.id === play.draft.kind)?.name ?? play.draft.kind}` : ""}`,
                  ...[play.draft.origin, play.draft.profession, play.draft.past].flatMap((id) => (id ? [content.packages.find((p) => p.id === id)?.name ?? id] : [])),
                  ...(result.ok ? [] : [`${result.errors.length} rules ${result.errors.length === 1 ? "problem" : "problems"}`]),
                ].join(" • ")}
              </p>
            </header>
          )}
          <main>
            {contentErrors.length > 0 && <div className="notice bad">Content failed to load: {contentErrors.join("; ")}</div>}
            {notice && (
              <Notice fades={notice.fades} onDismiss={() => setNotice(undefined)}>
                {notice.text}
              </Notice>
            )}

            {!play && (
              <section className="tools-start">
                <h2>Bring in a character</h2>
                <p className="lede">
                  Game Tools runs a character you already have during play: HP and the other resources, items, Conditions, leveling up, and an assistant you can
                  ask about the rules or tell what just happened.
                </p>
                <div className="tools-start-options">
                  {fromCreator && (
                    <button type="button" className="build-button" onClick={() => (setPlay(startPlay(toBuild(fromCreator))), setTab("tracker"))}>
                      Use {fromCreator.name ?? "the character"} from the Character Creator
                    </button>
                  )}
                  <button type="button" className="build-button" onClick={() => fileInput.current?.click()}>
                    Import a character file
                  </button>
                </div>
                <p className="hint">
                  A character file is the JSON the <a href="creator.php">Character Creator</a> exports from its Sheet. Everything here stays in this browser.
                </p>
              </section>
            )}

            {play && result && tab === "tracker" && <Tracker play={play} result={result} onChange={setPlay} />}
            {play && result && tab === "items" && <Items play={play} onChange={setPlay} />}
            {play && result && tab === "level" && <LevelUp play={play} result={result} onChange={setPlay} />}
          </main>
          {play && result && (
            <aside className="tools-chat-side">
              {/* What to do with the character, above the assistant, in the same buttons as Damage and Heal */}
              <div className="hero-bar tools-actions">
                <button type="button" onClick={exportBuild}>
                  Export
                </button>
                {confirmingSwitch ? (
                  <span className="hero-confirm">
                    <span className="tools-confirm-text">Put this character away? Its tracker, items and chat are cleared.</span>
                    <button
                      type="button"
                     
                      onClick={() => {
                        setPlay(undefined);
                        setConfirmingSwitch(false);
                        setNotice(undefined);
                      }}
                    >
                      Yes
                    </button>
                    <button type="button" onClick={() => setConfirmingSwitch(false)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmingSwitch(true)}>
                    Switch character
                  </button>
                )}
              </div>
              <Chat play={play} result={result} content={content} create={create} model={__SF_AI__.model} onChange={setPlay} check={(p) => checkPlay(p.draft, content)} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
