import { useEffect, useRef, useState } from "react";
import type { CreateMessage } from "../../ai/anthropic.js";
import { EndpointError } from "../../ai/remote.js";
import type { Content } from "../../engine/parse.js";
import type { BuildResult } from "../../engine/validate.js";
import { ask } from "../chat.js";
import type { Play } from "../play.js";

const EXAMPLES = ["I took 6 slashing damage", "What is my condition?", "I picked up 3 ration packs"];

// The assistant, beside the tools. It answers questions about the character
// and the rules, and changes the tracker when the player says what happened.
export function Chat({
  play,
  result,
  content,
  create,
  model,
  check,
  onChange,
}: {
  play: Play;
  result: BuildResult;
  content: Content;
  create: CreateMessage;
  model: string;
  check: (p: Play) => BuildResult;
  onChange: (p: Play) => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const log = useRef<HTMLOListElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [play.chat.length, busy]);

  const send = async (text: string) => {
    const said = text.trim();
    if (!said || busy) return;
    setBusy(true);
    setError(undefined);
    setMessage("");
    const asked: Play = { ...play, chat: [...play.chat, { role: "user", text: said }] };
    onChange(asked);
    try {
      // The earlier messages go along as history; this one is the question.
      const reply = await ask({ message: said, play: { ...asked, chat: play.chat }, check, content, create, model });
      onChange({ ...reply.play, chat: [...asked.chat, { role: "assistant", text: reply.text, ...(reply.changes.length ? { changes: reply.changes } : {}) }] });
    } catch (err) {
      setError(err instanceof EndpointError ? err.message : `Something went wrong: ${err instanceof Error ? err.message : String(err)}`);
      setMessage(said);
      onChange(play);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tools-chat" aria-label="Assistant">
      <div className="tools-chat-head">
        <h2 className="subhead">Assistant</h2>
        {play.chat.length > 0 && (
          <button type="button" className="link small" onClick={() => onChange({ ...play, chat: [] })} disabled={busy}>
            Clear
          </button>
        )}
      </div>
      <ol className="tools-chat-log" ref={log} aria-live="polite">
        {play.chat.length === 0 && (
          <li className="tools-chat-empty">
            <p className="muted">Ask about the rules or your Traits, or say what happened and I'll update the tracker.</p>
            <div className="tools-chat-examples">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className="tools-chat-example" onClick={() => send(e)} disabled={busy || !result.summary}>
                  {e}
                </button>
              ))}
            </div>
          </li>
        )}
        {play.chat.map((m, i) => (
          <li key={i} className={`tools-chat-msg is-${m.role}`}>
            <p>{m.text}</p>
            {m.changes && (
              <ul className="tools-chat-changes">
                {m.changes.map((c, j) => (
                  <li key={j}>{c}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {busy && (
          <li className="tools-chat-msg is-assistant is-busy">
            <p className="muted">Thinking…</p>
          </li>
        )}
      </ol>
      {error && <div className="notice bad">{error}</div>}
      <form
        className="tools-chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(message);
        }}
      >
        <textarea
          className="rpg-search-input"
          rows={4}
          placeholder="Ask, or say what happened"
          aria-label="Message to the assistant"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(message);
            }
          }}
        />
        <button type="submit" className="build-button" disabled={busy || !message.trim()} aria-busy={busy}>
          Send
        </button>
      </form>
    </section>
  );
}
