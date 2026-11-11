import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Popup } from "../app/components/popup.js";
import { endpointCreate } from "../ai/remote.js";
import { content, contentErrors } from "../app/content.js";
import { slug, toBuild, type Draft } from "../app/draft.js";
import { Icon, Notice } from "../app/components/ui.js";
import { describe } from "../app/check.js";
import { checkPlay, creatorDraft, load, playBuild, pointsToPlace, save, startPlay, type Play } from "./play.js";
import { Chat } from "./components/Chat.js";
import { Tracker } from "./components/Tracker.js";
import { Button } from "../app/components/Button.js";

export function ToolsApp() {
  const [play, setPlay] = useState<Play | undefined>(load);
  // A passing notice fades on its own; an error stays.
  const [notice, setNotice] = useState<{ text: string; fades?: boolean }>();
  // Switching characters asks in a popup; native confirm() dialogs are blocked in some browsers.
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const closeSwitch = useCallback(() => setConfirmingSwitch(false), []);
  // The list of rules problems, opened from their chip
  const [showingIssues, setShowingIssues] = useState(false);
  const closeIssues = useCallback(() => setShowingIssues(false), []);
  // The character one level up, while Level up is open on the Tracker
  const [levelDraft, setLevelDraft] = useState<Draft>();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => save(play), [play]);

  const result = useMemo(() => (play ? checkPlay(play.draft, content, play.items) : undefined), [play?.draft, play?.items]);
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
        <div className={`container builder-body tools-body${play ? "" : " no-side"}`}>
          {/* The character's sheet, once a character is in (Tracker, in the sheet's play context) */}
          <div className="tools-column">
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
                    Player Tools runs a character you already have during play: HP and the other resources, items, Conditions, leveling up, and an assistant you
                    can ask about the rules or tell what just happened.
                  </p>
                  <div className="tools-start-options">
                    {fromCreator && (
                      <Button className="build-button" onClick={() => setPlay(startPlay(toBuild(fromCreator)))}>
                        Use {fromCreator.name ?? "the character"} from the Character Creator
                      </Button>
                    )}
                    <Button className="build-button" onClick={() => fileInput.current?.click()}>
                      <Icon name="upload" />
                      Import a character file
                    </Button>
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
                  corner={
                    // Level up, a green + on the blob's corner, that turns into Cancel while the
                    // level up is open and throws its points away. Points the character already
                    // has to place come first, so it waits while there are any.
                    levelDraft && levelDraft.level > play.draft.level ? (
                      <Button size="pill" tone="primary" className="tools-level-up" onClick={() => setLevelDraft(undefined)}>
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        size="pill"
                        tone="primary"
                        className="tools-level-up"
                        aria-label="Level up"
                        disabled={Boolean(levelDraft) || pointsToPlace(play.draft, content)}
                        onClick={() => setLevelDraft({ ...play.draft, level: play.draft.level + 1 })}
                      >
                        <Icon name="plus" />
                      </Button>
                    )
                  }
                  actions={
                    // Download character and Switch character as gray badges, then any rules
                    // problems as the creator's red chip, which opens them as a list
                    <div className="hero-bar tools-actions">
                      <Button size="pill" onClick={exportBuild}>
                        <Icon name="download" />
                        Download character
                      </Button>
                      <Button size="pill" onClick={() => setConfirmingSwitch(true)}>
                        <Icon name="switch" />
                        Switch character
                      </Button>
                      {!result.ok && (
                        <ul className="issues step-issues tools-issues">
                          <li>
                            <Button kind="bare" onClick={() => setShowingIssues(true)}>
                              {result.errors.length} rules {result.errors.length === 1 ? "problem" : "problems"}
                            </Button>
                          </li>
                        </ul>
                      )}
                    </div>
                  }
                />
              )}
              {play && confirmingSwitch && (
                <Popup label="Switch character" title="Switch character" onClose={closeSwitch} size="narrow" className="tools-switch-popup">
                  <p>Put {play.draft.name || "this character"} away? Their tracker, items and chat are cleared.</p>
                  <div className="tools-switch-actions">
                    <Button
                      tone="dark"
                      onClick={() => {
                        setPlay(undefined);
                        setLevelDraft(undefined);
                        setConfirmingSwitch(false);
                        setNotice(undefined);
                      }}
                    >
                      Switch character
                    </Button>
                    <Button onClick={closeSwitch}>Cancel</Button>
                  </div>
                </Popup>
              )}
              {play && result && showingIssues && !result.ok && (
                <Popup label="Rules problems" title="Rules problems" onClose={closeIssues} className="tools-issues-popup">
                  <ul className="tools-issue-list">
                    {result.errors.map((e, i) => (
                      <li key={i}>{describe(e, play.draft)}</li>
                    ))}
                  </ul>
                </Popup>
              )}
            </main>
          </div>
          {play && result && (
            <aside className="tools-chat-side">
              <Chat
                play={play}
                result={result}
                content={content}
                create={create}
                model={__SF_AI__.model}
                onChange={setPlay}
                check={(p) => checkPlay(p.draft, content, p.items)}
              />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
