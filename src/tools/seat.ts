// Player Tools at a Game Master's table (src/table/table.ts): joining with a
// code, sending the table a copy of the sheet a second after the character
// changes, and checking in now and then so the Game Master sees it's here.
// The seat is kept in this browser, so a refresh reconnects on its own.
import { useCallback, useEffect, useRef, useState } from "react";
import { joinTable, leaveTable, loadSeat, saveSeat, sheetCopy, syncSeat, TableError, type SeatSession } from "../table/table.js";
import type { Play } from "./play.js";

const SEND_AFTER_MS = 1000;
const CHECK_IN_MS = 30_000;

export interface SeatState {
  seat?: SeatSession;
  // Why the last send or check-in failed, while it keeps failing
  trouble?: string;
  join: (code: string) => Promise<void>;
  leave: () => Promise<void>;
}

// `onGone` hears when the table closed or the Game Master removed this seat.
export function useSeat(play: Play | undefined, onGone: (message: string) => void): SeatState {
  const [seat, setSeat] = useState<SeatSession | undefined>(loadSeat);
  const [trouble, setTrouble] = useState<string>();
  // The last copy the table has, so an unchanged character isn't sent again
  const sent = useRef<string | undefined>(undefined);
  const gone = useRef(onGone);
  gone.current = onGone;

  const drop = useCallback((message?: string) => {
    saveSeat(undefined);
    setSeat(undefined);
    setTrouble(undefined);
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

  // The sheet, a second after it changes
  const copy = play ? JSON.stringify(sheetCopy(play)) : undefined;
  useEffect(() => {
    if (!seat || !play || !copy || copy === sent.current) return;
    const timer = setTimeout(() => {
      syncSeat(seat, play.draft.name, JSON.parse(copy))
        .then(() => {
          sent.current = copy;
          setTrouble(undefined);
        })
        .catch(failed);
    }, SEND_AFTER_MS);
    return () => clearTimeout(timer);
  }, [seat, copy]);

  // Checking in, while the page is open
  useEffect(() => {
    if (!seat) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") syncSeat(seat).then(() => setTrouble(undefined), failed);
    }, CHECK_IN_MS);
    return () => clearInterval(timer);
  }, [seat, failed]);

  const join = async (code: string) => {
    if (!play) return;
    const c = sheetCopy(play);
    const joined = await joinTable(code, play.draft.name ?? "", c);
    const s = { code: joined.table.code, name: joined.table.name, seatId: joined.seatId, playerKey: joined.playerKey };
    saveSeat(s);
    sent.current = JSON.stringify(c);
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

  return { seat, trouble, join, leave };
}
