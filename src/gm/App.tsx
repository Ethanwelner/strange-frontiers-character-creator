// The Game Master tools: make a table, give the players its join code, and
// follow their characters as they play. Each player's sheet stays in their
// Player Tools, which sends the table a copy whenever it changes; this page
// asks the table for changed copies every few seconds while it's open.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { content, contentErrors, kindById, packageById } from "../app/content.js";
import { Popup } from "../app/components/popup.js";
import { Sheet } from "../app/components/Sheet.js";
import { RESOURCE_NAMES } from "../app/components/sheet-layout.js";
import { Icon, Notice } from "../app/components/ui.js";
import { Button } from "../app/components/Button.js";
import type { BuildResult } from "../engine/validate.js";
import { checkPlay, currentOf, maxOf, shownResources, type Play } from "../tools/play.js";
import {
  createTable,
  gmPoll,
  loadGm,
  playOfCopy,
  readRecovery,
  recoveryLink,
  saveGm,
  showCode,
  TableError,
  type GmSession,
  type Seat,
} from "../table/table.js";

const POLL_MS = 3000;
// A player who checked in this recently is at the table now
const HERE_SECONDS = 75;

interface Player {
  seat: Seat;
  play?: Play;
  result?: BuildResult;
}

// The recovery link opened in this browser takes over as its table.
function startingSession(): GmSession | undefined {
  const recovered = readRecovery(location.hash);
  if (recovered) {
    const s = { ...recovered, name: "" };
    saveGm(s);
    return s;
  }
  return loadGm();
}

function ago(seconds: number): string {
  if (seconds < HERE_SECONDS) return "At the table";
  const m = Math.round(seconds / 60);
  if (m < 60) return `Last here ${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `Last here ${h} hr ago`;
  return `Last here ${Math.round(h / 24)} days ago`;
}

export function GmApp() {
  const [session, setSession] = useState<GmSession | undefined>(startingSession);
  const [notice, setNotice] = useState<{ text: string; fades?: boolean; bad?: boolean }>();
  // The recovery link has done its job once it's saved here.
  useEffect(() => {
    if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
  }, []);

  // ---- Making a table ----
  const [tableName, setTableName] = useState("");
  const [making, setMaking] = useState(false);
  const make = async () => {
    setMaking(true);
    setNotice(undefined);
    try {
      const made = await createTable(tableName);
      const s = { code: made.code, name: made.name, gmKey: made.gmKey };
      saveGm(s);
      setSession(s);
      setTableName("");
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : String(err), bad: true });
    } finally {
      setMaking(false);
    }
  };

  // ---- Following the table ----
  const [players, setPlayers] = useState<Player[]>([]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [lost, setLost] = useState<string>();
  const [offline, setOffline] = useState(false);
  const known = useRef<Record<string, number>>({});
  const sheets = useRef<Record<string, Player>>({});

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (document.visibilityState === "visible") {
        try {
          const got = await gmPoll(session, known.current);
          if (stopped) return;
          setOffline(false);
          setNow(got.now);
          if (got.table.name !== session.name) {
            const s = { ...session, name: got.table.name };
            saveGm(s);
            setSession(s);
          }
          const next: Record<string, Player> = {};
          for (const seat of got.seats) {
            const had = sheets.current[seat.id];
            if (seat.sheet) {
              const play = playOfCopy(seat.sheet);
              next[seat.id] = { seat, play, result: checkPlay(play.draft, content, play.items) };
            } else next[seat.id] = { ...had, seat };
            known.current[seat.id] = seat.version;
          }
          for (const id of Object.keys(known.current)) if (!next[id]) delete known.current[id];
          sheets.current = next;
          setPlayers(got.seats.map((s) => next[s.id]!));
        } catch (err) {
          if (stopped) return;
          if (err instanceof TableError && (err.code === "no-table" || err.code === "not-gm")) {
            setLost(err.message);
            return;
          }
          setOffline(true);
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    // Back to the tab: check right away
    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) {
        clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session?.code, session?.gmKey]);

  // ---- The table's header ----
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ text: `Copied the ${what}.`, fades: true });
    } catch {
      setNotice({ text: `Couldn't copy the ${what}. Select it and copy it yourself.`, bad: true });
    }
  };
  const [forgetting, setForgetting] = useState(false);
  const closeForget = useCallback(() => setForgetting(false), []);
  const forget = () => {
    saveGm(undefined);
    setSession(undefined);
    setPlayers([]);
    setLost(undefined);
    known.current = {};
    sheets.current = {};
    setForgetting(false);
  };

  const [open, setOpen] = useState<string>();
  const closeSheet = useCallback(() => setOpen(undefined), []);
  const opened = players.find((p) => p.seat.id === open);

  return (
    <div className="sf-creator sf-tools sf-gm">
      <header className="builder-hero">
        <div className="container d-flex builder-row">
          <div className="builder-main hero-main">
            <div className="builder-statement">
              <h1 className="title hero-title frontiers-accent frontiers-glitch" data-text="Strange Frontiers">
                Strange Frontiers
              </h1>
              <p className="title section-title">Game Master Tools</p>
            </div>
          </div>
        </div>
      </header>

      <div className="section unlimited white-bg builder-panel">
        <div className="container builder-body tools-body no-side">
          <div className="tools-column">
            <main>
              {contentErrors.length > 0 && <div className="notice bad">Content failed to load: {contentErrors.join("; ")}</div>}
              {notice && (
                <Notice fades={notice.fades} bad={notice.bad} onDismiss={() => setNotice(undefined)}>
                  {notice.text}
                </Notice>
              )}

              {!session && (
                <section className="tools-start">
                  <h2>Run a table</h2>
                  <p className="lede">
                    Make a table and give your players its join code. They join from Player Tools with their characters, and you see their sheets here
                    as they play, kept up to date as they change.
                  </p>
                  <form
                    className="gm-make"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void make();
                    }}
                  >
                    <input
                      type="text"
                      className="gm-make-name"
                      aria-label="Table name"
                      placeholder="Table name, like Tuesday Night Isekai"
                      maxLength={60}
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                    />
                    <Button type="submit" className="build-button" tone="primary" waiting={making} disabled={making}>
                      Make a table
                    </Button>
                  </form>
                  <p className="hint">Lost your table? Open its recovery link in this browser to pick it back up.</p>
                </section>
              )}

              {session && (
                <section className="gm-table">
                  <div className="gm-table-head">
                    <div className="gm-table-title">
                      <h2>{session.name || "Your table"}</h2>
                      <p className="gm-table-count">
                        {players.length} {players.length === 1 ? "player" : "players"}
                        {offline && <span className="gm-offline"> · The table isn't answering; trying again</span>}
                      </p>
                    </div>
                    <div className="gm-table-code">
                      <span className="field-label">Join code</span>
                      <span className="gm-code">{showCode(session.code)}</span>
                      <Button size="pill" onClick={() => void copy(showCode(session.code), "join code")}>
                        Copy
                      </Button>
                    </div>
                  </div>
                  <div className="gm-table-tools">
                    <Button size="pill" onClick={() => void copy(recoveryLink(session), "recovery link")} title="Opens this table as its Game Master in any browser. Keep it private.">
                      Copy recovery link
                    </Button>
                    <Button size="pill" onClick={() => setForgetting(true)}>
                      Forget this table
                    </Button>
                  </div>
                  <p className="hint gm-recovery-hint">
                    Save the recovery link somewhere private. It's the only way back to this table if this browser forgets it.
                  </p>

                  {lost && (
                    <div className="notice bad gm-lost">
                      {lost}{" "}
                      <Button kind="link" onClick={forget}>
                        Forget this table
                      </Button>
                    </div>
                  )}

                  {players.length === 0 ? (
                    <p className="gm-empty">
                      No players yet. Give them the join code <strong>{showCode(session.code)}</strong>: they join from Player Tools, with Join a table.
                    </p>
                  ) : (
                    <ul className="gm-players">
                      {players.map((p) => (
                        <li key={p.seat.id}>
                          <PlayerCard player={p} now={now} onOpen={() => setOpen(p.seat.id)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {session && forgetting && (
                <Popup label="Forget this table" title="Forget this table" onClose={closeForget} size="narrow" className="tools-switch-popup">
                  <p>
                    Forget {session.name || "this table"} in this browser? The table stays open for its players, and its recovery link still brings it
                    back.
                  </p>
                  <div className="tools-switch-actions">
                    <Button tone="dark" onClick={forget}>
                      Forget this table
                    </Button>
                    <Button onClick={closeForget}>Cancel</Button>
                  </div>
                </Popup>
              )}

              {opened?.play && opened.result && (
                // The sheet in the wide popup (1100px), scrolling as one
                <Popup label={opened.seat.name} onClose={closeSheet} size="wide" className="gm-sheet-popup">
                  <Sheet
                    context="view"
                    draft={opened.play.draft}
                    result={opened.result}
                    items={opened.play.items}
                    conditions={opened.play.conditions}
                    hp={currentOf(opened.play, opened.result, "hp")}
                    resources={<Meters play={opened.play} result={opened.result} />}
                  />
                </Popup>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

// HP, VP, SP, MP and an AI Core's core, each as its value over its max and a
// meter, without the player's controls: in a row like Player Tools', or
// stacked on a player's card
function Meters({ play, result, stacked }: { play: Play; result: BuildResult; stacked?: boolean }) {
  return (
    <div className={`tools-resources${stacked ? " gm-meters" : ""}`}>
      {shownResources(result).map((r) => {
        const cur = currentOf(play, result, r);
        const max = maxOf(result, r);
        const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
        return (
          <div key={r} className="tools-resource">
            <div className="tools-resource-value">
              <strong className={`tools-resource-name resource-${r}`} title={RESOURCE_NAMES[r]}>
                {r.toUpperCase()}
              </strong>
              <span className="num">
                {cur}
                <span className="muted"> / {max}</span>
              </span>
            </div>
            <div className={`tools-meter tools-meter-${r}`} aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// A player at the table: who they are, their resources and Conditions, and
// whether they're here. Opens their sheet.
function PlayerCard({ player, now, onOpen }: { player: Player; now: number; onOpen: () => void }) {
  const { seat, play, result } = player;
  const here = now - seat.seen < HERE_SECONDS;
  const line = useMemo(() => {
    if (!play) return undefined;
    const kind = play.draft.kind ? kindById.get(play.draft.kind)?.name : undefined;
    const profession = play.draft.profession ? packageById.get(play.draft.profession)?.name : undefined;
    return [`Level ${play.draft.level}`, kind, profession].filter(Boolean).join(" · ");
  }, [play]);
  const conditions = play?.conditions ?? [];
  return (
    <article className={`gm-player sf-sheet-box${here ? " is-here" : ""}`}>
      <div className="gm-player-head">
        <div>
          <h3 className="gm-player-name">{seat.name}</h3>
          {line && <p className="gm-player-line">{line}</p>}
        </div>
        <span className={`gm-presence${here ? " is-here" : ""}`}>{ago(now - seat.seen)}</span>
      </div>
      {play && result ? (
        <>
          <Meters play={play} result={result} stacked />
          {conditions.length > 0 && (
            <ul className="gm-player-conditions">
              {conditions.map((c) => (
                <li key={c.trait} className="sf-chip">
                  {content.traits.find((t) => t.id === c.trait)?.name ?? c.trait}
                  {c.rank > 1 ? ` (${c.rank})` : ""}
                </li>
              ))}
            </ul>
          )}
          <Button size="small" tone="primary" className="gm-player-open" onClick={onOpen}>
            <Icon name="play" />
            Open sheet
          </Button>
        </>
      ) : (
        <p className="sf-sheet-empty">Waiting for their sheet.</p>
      )}
    </article>
  );
}
