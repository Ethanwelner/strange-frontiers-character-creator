// A table's log, the same on the Game Master tools and in Player Tools: chat
// and d20 rolls with their times, and the table's notes about who joined and
// left, with a message box under them. It looks like Player Tools' assistant
// chat (styles.css, .tools-chat): this browser's own messages on the right,
// everyone else's on the left under their name.
import { useEffect, useRef, useState } from "react";
import { Button } from "../app/components/Button.js";
import { Icon } from "../app/components/ui.js";
import type { LogEntry } from "./table.js";

const time = (at: number) => new Date(at * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function TableLog({
  log,
  me,
  onSay,
  empty,
}: {
  log: LogEntry[];
  // This browser's place in the log: its seat id, or "gm"
  me: string;
  onSay: (text: string) => Promise<void>;
  // What shows before anything's been said
  empty: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const list = useRef<HTMLOListElement>(null);
  // New entries scroll into view
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [log.at(-1)?.id]);

  const send = async () => {
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await onSay(text);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tools-chat table-log" aria-label="Table">
      <div className="tools-chat-box">
        <ol className="tools-chat-log" ref={list} aria-live="polite">
          {log.length === 0 && (
            <li className="tools-chat-empty">
              <p className="muted">{empty}</p>
            </li>
          )}
          {log.map((e) =>
            e.kind === "join" || e.kind === "leave" || e.kind === "change" ? (
              <li key={e.id} className={`table-log-note${e.kind === "change" ? " is-change" : ""}`}>
                <span>{e.text}</span> <time>{time(e.at)}</time>
              </li>
            ) : (
              <li key={e.id} className={`tools-chat-msg table-log-entry is-${e.seat === me ? "user" : "assistant"}${e.kind === "roll" ? " is-roll" : ""}${e.seat === "gm" ? " is-gm" : ""}`}>
                <p className="table-log-who">
                  <strong>{e.seat === me ? "You" : e.author}</strong> <time>{time(e.at)}</time>
                </p>
                {e.kind === "roll" ? (
                  <p className="table-log-roll">
                    Rolled a d20: <strong>{e.value}</strong>
                  </p>
                ) : (
                  <p>{e.text}</p>
                )}
              </li>
            ),
          )}
        </ol>
        {error && <p className="table-log-error">{error}</p>}
        <form
          className="tools-chat-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            void send();
          }}
        >
          <textarea
            className="rpg-search-input"
            rows={1}
            maxLength={1000}
            placeholder="Message the table"
            aria-label="Message the table"
            value={message}
            onChange={(ev) => setMessage(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                void send();
              }
            }}
          />
          <Button type="submit" round="md" tone="primary" ready={!busy && Boolean(message.trim())} className="tools-chat-send" disabled={busy || !message.trim()} aria-busy={busy}>
            <Icon name="send" label="Send" />
          </Button>
        </form>
      </div>
    </section>
  );
}
