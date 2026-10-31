import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { endpointCreate } from "../ai/remote.js";
import { content, contentErrors } from "../app/content.js";
import { slug, toBuild, type Draft } from "../app/draft.js";
import { Icon, LorePopup, NameField, Notice } from "../app/components/ui.js";
import { describe } from "../app/check.js";
import { checkPlay, creatorDraft, load, playBuild, pointsToPlace, save, startPlay, type Play } from "./play.js";
import { BackgroundPopup } from "../app/components/BackgroundPopup.js";
import { Chat } from "./components/Chat.js";
import { Tracker } from "./components/Tracker.js";


export function ToolsApp() {
  const [play, setPlay] = useState<Play | undefined>(load);
  // A passing notice fades on its own; an error stays.
  const [notice, setNotice] = useState<{ text: string; fades?: boolean }>();
  // Switching characters asks in a popup; native confirm() dialogs are blocked in some browsers.
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const closeSwitch = useCallback(() => setConfirmingSwitch(false), []);
  // The Kind or background package whose card is open, from the line under the name
  const [showing, setShowing] = useState<string>();
  const closePopup = useCallback(() => setShowing(undefined), []);
  // The list of rules problems, opened from their chip
  const [showingIssues, setShowingIssues] = useState(false);
  // The right column never scrolls itself. The chat's conversation gets the
  // window's height left over from the rest of the column (at least 120px)
  // and scrolls inside; if even that doesn't fit (a short window), the
  // column stops sticking and scrolls with the page.
  const side = useRef<HTMLElement>(null);
  const [tallSide, setTallSide] = useState(false);
  useEffect(() => {
    const el = side.current;
    if (!el) return;
    const fit = () => {
      const log = el.querySelector<HTMLElement>(".tools-chat-log");
      const rest = el.offsetHeight - (log?.offsetHeight ?? 0);
      const room = window.innerHeight - 32 - rest;
      el.style.setProperty("--chat-log-max", `${Math.max(120, room)}px`);
      setTallSide(room < 120);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    window.addEventListener("resize", fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [Boolean(play)]);
  const closeIssues = useCallback(() => setShowingIssues(false), []);
  // The character one level up, while Level up is open on the Tracker
  const [levelDraft, setLevelDraft] = useState<Draft>();
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
      setNotice({ text: `Imported ${file.name}.`, fades: true });
    } catch (err) {
      setNotice({ text: `Couldn't import ${file.name}: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  // The build as the Character Creator exports it, with the items carried
  // now, so it goes back there too.
  const exportBuild = () => {
    if (!play) return;
    const json = JSON.stringify(playBuild(play), null, 2);
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
              <p className="title section-title">Player Tools</p>
            </div>
          </div>
        </div>
      </header>

      <div className="section unlimited white-bg builder-panel">
        {/* 24px from the top of the panel: the rules problems chip at the left, and Download
            character and Switch character, as gray badges, over the right column. They scroll
            away with the page; the assistant under them sticks. */}
        {play && result && (
          <div className="container tools-actions-bar">
            {/* Any rules problems, as the creator's red error chip, which opens them as a list */}
            {!result.ok && (
              <ul className="issues step-issues tools-issues">
                <li>
                  <button type="button" onClick={() => setShowingIssues(true)}>
                    {result.errors.length} rules {result.errors.length === 1 ? "problem" : "problems"}
                  </button>
                </li>
              </ul>
            )}
            <div className="hero-bar tools-actions">
              <button type="button" onClick={exportBuild}>
                <Icon name="download" />
                Download character
              </button>
              <button type="button" onClick={() => setConfirmingSwitch(true)}>
                <Icon name="switch" />
                Switch character
              </button>
            </div>
            {confirmingSwitch && (
              <LorePopup label="Switch character" onClose={closeSwitch} className="tools-switch-popup">
                <h3 className="lore-modal-title">Switch character</h3>
                <p>Put {play.draft.name || "this character"} away? Their tracker, items and chat are cleared.</p>
                <div className="tools-switch-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setPlay(undefined);
                      setLevelDraft(undefined);
                      setConfirmingSwitch(false);
                      setNotice(undefined);
                    }}
                  >
                    Switch character
                  </button>
                  <button type="button" onClick={closeSwitch}>
                    Cancel
                  </button>
                </div>
              </LorePopup>
            )}
          </div>
        )}
        <div className={`container builder-body tools-body${play ? "" : " no-side"}`}>
          {/* The character and the tracker, in a box like the creator's sheet once a character is in,
              with the level in a blob over its top left corner */}
          <div className={`tools-column${play ? " tools-box" : ""}`}>
            {play && (
              <div className="level-badge level-blob" aria-label={`Level ${play.draft.level}`}>
                <span className="level-badge-label">Level</span>
                <span className="level-badge-number">{play.draft.level}</span>
              </div>
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
                    Player Tools runs a character you already have during play: HP and the other resources, items, Conditions, leveling up, and an assistant you can
                    ask about the rules or tell what just happened.
                  </p>
                  <div className="tools-start-options">
                    {fromCreator && (
                      <button type="button" className="build-button" onClick={() => setPlay(startPlay(toBuild(fromCreator)))}>
                        Use {fromCreator.name ?? "the character"} from the Character Creator
                      </button>
                    )}
                    <button type="button" className="build-button" onClick={() => fileInput.current?.click()}>
                      <Icon name="upload" />
                      Import a character file
                    </button>
                  </div>
                  <p className="hint">
                    A character file is the JSON the <a href="creator.php">Character Creator</a> exports from its Sheet. Everything here stays in this browser.
                  </p>
                </section>
              )}

              {/* Everything happens on the Tracker: the character's name over resources in the
                  first box, then the sheet's columns, then its Traits */}
              {play && result && (
                <Tracker
                  play={play}
                  result={result}
                  onChange={setPlay}
                  levelDraft={levelDraft}
                  onLevelDraft={setLevelDraft}
                  head={
                    <header className="step-head tools-character">
                      <div className="tools-character-main">
                        {/* The name, with the creator's pen to edit it, and Level up at the right as a
                            green badge, which turns into Cancel while the level up is open and throws
                            its points away. Points the character already has to place come first, so
                            it waits while there are any. */}
                        <div className="tools-character-head">
                          <NameField
                            className="sheet-name tools-name"
                            heading="h2"
                            name={play.draft.name}
                            onChange={(name) => setPlay({ ...play, draft: { ...play.draft, name } })}
                          />
                          {levelDraft && levelDraft.level > play.draft.level ? (
                            <button type="button" className="tools-level-up" onClick={() => setLevelDraft(undefined)}>
                              Cancel
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="tools-level-up"
                              disabled={Boolean(levelDraft) || pointsToPlace(play.draft, content)}
                              onClick={() => setLevelDraft({ ...play.draft, level: play.draft.level + 1 })}
                            >
                              Level up
                            </button>
                          )}
                        </div>
                        {/* "Isek • Dreft • Licensed Mage • Expelled from the Mage Schools", each of the
                            Kind and background a link to its card */}
                        <p className="tools-line">
                          {[play.draft.kind, play.draft.origin, play.draft.profession, play.draft.past].map((id, n, ids) =>
                            id ? (
                              <span key={n}>
                                {ids.slice(0, n).some(Boolean) && " • "}
                                <button type="button" className="link" onClick={() => setShowing(id)}>
                                  {(n === 0 ? content.kinds.find((k) => k.id === id)?.name : content.packages.find((p) => p.id === id)?.name) ?? id}
                                </button>
                              </span>
                            ) : null,
                          )}
                        </p>
                        {showing && <BackgroundPopup id={showing} onClose={closePopup} />}
                        {showingIssues && !result.ok && (
                          <LorePopup label="Rules problems" onClose={closeIssues} className="tools-issues-popup">
                            <h3 className="lore-modal-title">Rules problems</h3>
                            <ul className="tools-issue-list">
                              {result.errors.map((e, i) => (
                                <li key={i}>{describe(e, play.draft)}</li>
                              ))}
                            </ul>
                          </LorePopup>
                        )}
                      </div>
                    </header>
                  }
                />
              )}
            </main>
          </div>
          {play && result && (
            <aside ref={side} className={`tools-chat-side${tallSide ? " is-tall" : ""}`}>
              <Chat play={play} result={result} content={content} create={create} model={__SF_AI__.model} onChange={setPlay} check={(p) => checkPlay(p.draft, content)} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
