// Player Tools at a Game Master's table (src/table/table.ts): joining with a
// code, sending the table a copy of the sheet a second after the character
// changes, and checking in every few seconds while the page is open, which
// brings the table's log (its chat and rolls) up to date. The seat is kept
// in this browser, so a refresh reconnects on its own.
//
// A check-in also brings the Game Master's changes to the character (a Trait
// given or taken away), which `onChanges` applies; the next check-in tells
// the table they're done. The last one applied is kept with the seat, so a
// reload doesn't apply it twice.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  joinTable,
  leaveTable,
  loadSeat,
  rollToTable,
  saveSeat,
  say,
  sheetCopy,
  syncSeat,
  TableError,
  withEntries,
  type GmChange,
  type LogEntry,
  type SeatSession,
} from "../table/table.js";
import type { Play } from "./play.js";

const SEND_AFTER_MS = 1000;
const CHECK_IN_MS = 3000;

export interface SeatState {
  seat?: SeatSession;
  // Why the last send or check-in failed, while it keeps failing
  trouble?: string;
  // The table's log, newest last, and how many entries came in from others
  // since the player last looked at it (`seen`)
  log: LogEntry[];
  unread: number;
  seen: () => void;
  join: (code: string) => Promise<void>;
  leave: () => Promise<void>;
  say: (text: string) => Promise<void>;
  roll: (value: number) => void;
}

// `onGone` hears when the table closed or the Game Master removed this seat.
export function useSeat(play: Play | undefined, onGone: (message: string) => void, onChanges: (changes: GmChange[]) => void): SeatState {
  const [seat, setSeat] = useState<SeatSession | undefined>(loadSeat);
  // The last Game Master change applied, told to the table with each check-in
  const applied = useRef(seat?.applied ?? 0);
  const seatNow = useRef(seat);
  seatNow.current = seat;
  const changes = useRef(onChanges);
  changes.current = onChanges;
  const withAck = (s: SeatSession): SeatSession => ({ ...s, ...(applied.current ? { applied: applied.current } : {}) });
  const [trouble, setTrouble] = useState<string>();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [readUpTo, setReadUpTo] = useState(0);
  // The last log entry this page has, so only newer ones come back
  const since = useRef(0);
  // The last copy the table has, so an unchanged character isn't sent again
  const sent = useRef<string | undefined>(undefined);
  const gone = useRef(onGone);
  gone.current = onGone;

  const addEntries = useCallback((added: LogEntry[]) => {
    if (!added.length) return;
    // The first batch is the history: it's been read
    const first = since.current === 0;
    since.current = Math.max(since.current, ...added.map((e) => e.id));
    if (first) setReadUpTo(since.current);
    setLog((l) => withEntries(l, added));
  }, []);

  const drop = useCallback((message?: string) => {
    saveSeat(undefined);
    setSeat(undefined);
    setTrouble(undefined);
    setLog([]);
    setReadUpTo(0);
    since.current = 0;
    applied.current = 0;
    sent.current = undefined;
    if (message) gone.current(message);
  }, []);

  // A failed send: a seat that's gone is dropped; anything else is shown
  // and tried again with the next change or check-in.
  const failed = useCallback(
    (err: unknown) => {
      if (err instanceof TableError && (err.code === "no-seat" || err.code === "no-table")) drop(`You've left ${seat?.name ?? "the table"}: ${err.message}`);
      else setTrouble(err instanceof Error ? err.message : String(err));
    },
    [drop, seat?.name],
  );
  const synced = useCallback(
    (r: { log: LogEntry[]; changes: GmChange[] }) => {
      setTrouble(undefined);
      addEntries(r.log);
      // The Game Master's changes this page hasn't applied yet
      const fresh = r.changes.filter((c) => c.id > applied.current);
      if (fresh.length && seatNow.current) {
        changes.current(fresh);
        applied.current = Math.max(...fresh.map((c) => c.id));
        saveSeat({ ...seatNow.current, applied: applied.current });
      }
    },
    [addEntries],
  );

  // The sheet, a second after it changes
  const copy = play ? JSON.stringify(sheetCopy(play)) : undefined;
  useEffect(() => {
    if (!seat || !play || !copy || copy === sent.current) return;
    const timer = setTimeout(() => {
      syncSeat(withAck(seat), since.current, play.draft.name, JSON.parse(copy))
        .then((r) => {
          sent.current = copy;
          synced(r);
        })
        .catch(failed);
    }, SEND_AFTER_MS);
    return () => clearTimeout(timer);
  }, [seat, copy]);

  // Checking in every few seconds while the page is open, and right away on
  // coming back to it
  useEffect(() => {
    if (!seat) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (document.visibilityState === "visible") {
        try {
          const r = await syncSeat(withAck(seat), since.current);
          if (!stopped) synced(r);
        } catch (err) {
          if (!stopped) failed(err);
        }
      }
      if (!stopped) timer = setTimeout(check, CHECK_IN_MS);
    };
    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) {
        clearTimeout(timer);
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [seat, failed, synced]);

  const join = async (code: string) => {
    if (!play) return;
    const c = sheetCopy(play);
    const joined = await joinTable(code, play.draft.name ?? "", c);
    const s = { code: joined.table.code, name: joined.table.name, seatId: joined.seatId, playerKey: joined.playerKey };
    saveSeat(s);
    sent.current = JSON.stringify(c);
    since.current = 0;
    applied.current = 0;
    setLog([]);
    setTrouble(undefined);
    setSeat(s);
  };

  const leave = async () => {
    if (!seat) return;
    try {
      await leaveTable(seat);
    } catch (err) {
      // Already gone is as good as leaving
      if (!(err instanceof TableError && (err.code === "no-seat" || err.code === "no-table"))) throw err;
    }
    drop();
  };

  const sayToTable = async (text: string) => {
    if (!seat) return;
    const r = await say(seat, text);
    addEntries([r.entry]);
    setReadUpTo((n) => Math.max(n, r.entry.id));
  };

  // A d20 roll goes to the table while the character's at one
  const roll = (value: number) => {
    if (!seat) return;
    rollToTable(seat, value).then((r) => {
      addEntries([r.entry]);
      setReadUpTo((n) => Math.max(n, r.entry.id));
    }, failed);
  };

  const unread = log.filter((e) => e.id > readUpTo && e.seat !== seat?.seatId).length;
  const seen = useCallback(() => setReadUpTo(since.current), []);

  return { seat, trouble, log, unread, seen, join, leave, say: sayToTable, roll };
}
