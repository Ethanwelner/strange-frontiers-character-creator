// Game Master tables, shared by Player Tools and the Game Master tools. A table
// lives on the site (game-table-api.php in portfolio_site, php/rpg/game-table.php),
// reached at __SF_AI__.tableEndpoint: the site's PHP server in development,
// through Vite's proxy.
//
// There are no accounts. Making a table gives the Game Master a private key,
// and joining one gives the player a private seat key; each is kept in this
// browser's storage, so a refresh or a restart picks up where it left off.
// The player's sheet stays in Player Tools, which sends the table a copy
// whenever the character changes.
import { playBuild, startPlay, type Play, type ResourceKey } from "../tools/play.js";

// What Player Tools sends: the build as a file (with the items and
// Conditions it has now, without the portrait, which is too big to share) and
// the current HP, VP, SP and MP.
export interface SheetCopy {
  build: Record<string, unknown>;
  current: Partial<Record<ResourceKey, number>>;
}

export interface TableInfo {
  code: string;
  name: string;
}

export interface Seat {
  id: string;
  name: string;
  version: number;
  joined: number;
  seen: number;
  sheet?: SheetCopy;
}

// This browser's place at a table: as its Game Master, or a player's seat.
export interface GmSession {
  code: string;
  name: string;
  gmKey: string;
}

export interface SeatSession {
  code: string;
  name: string;
  seatId: string;
  playerKey: string;
}

export class TableError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(__SF_AI__.tableEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    throw new TableError("offline", "Couldn't reach the table. Check your connection.");
  }
  const data = (await res.json().catch(() => undefined)) as (T & { error?: string; message?: string }) | undefined;
  if (!res.ok || !data || data.error) throw new TableError(data?.error ?? "server", data?.message ?? "The table didn't answer. Try again.");
  return data;
}

export const createTable = (name: string) => call<{ code: string; name: string; gmKey: string }>("create", { name });

// The table and its seats. `known` is each seat's sheet version this browser
// already has, so only sheets that changed come back.
export const gmPoll = (s: GmSession, known: Record<string, number>) =>
  call<{ table: TableInfo; now: number; seats: Seat[] }>("gm", { code: s.code, gmKey: s.gmKey, known });

export const joinTable = (code: string, name: string, sheet: SheetCopy) =>
  call<{ seatId: string; playerKey: string; table: TableInfo }>("join", { code, name, sheet });

// Checking in, with a new copy of the sheet when the character changed.
export const syncSeat = (s: SeatSession, name?: string, sheet?: SheetCopy) =>
  call<{ table: TableInfo; version: number }>("sync", { code: s.code, seatId: s.seatId, playerKey: s.playerKey, ...(sheet ? { name, sheet } : {}) });

export const leaveTable = (s: SeatSession) => call<{ ok: true }>("leave", { code: s.code, seatId: s.seatId, playerKey: s.playerKey });

export function sheetCopy(play: Play): SheetCopy {
  const { portrait: _portrait, ...build } = playBuild(play);
  return { build, current: play.current };
}

// A sheet copy as a play, for the Game Master's view of it.
export function playOfCopy(copy: SheetCopy): Play {
  return { ...startPlay(copy.build), current: copy.current ?? {} };
}

// A join code as people read it: KXV-482
export const showCode = (code: string) => (code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code);

// ---- This browser's sessions, kept like the characters are ----

const GM_KEY = "sf-table-gm:v1";
const SEAT_KEY = "sf-table-seat:v1";

function read<T>(key: string, valid: (v: Partial<T>) => boolean): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as Partial<T>) : undefined;
    return v && valid(v) ? (v as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // Storage can be full or blocked; the session works until the page closes.
  }
}

export const loadGm = () => read<GmSession>(GM_KEY, (v) => typeof v.code === "string" && typeof v.gmKey === "string");
export const saveGm = (s?: GmSession) => write(GM_KEY, s);
export const loadSeat = () =>
  read<SeatSession>(SEAT_KEY, (v) => typeof v.code === "string" && typeof v.seatId === "string" && typeof v.playerKey === "string");
export const saveSeat = (s?: SeatSession) => write(SEAT_KEY, s);

// The Game Master's recovery link: this page with the table's code and GM key
// after the #, which restores the table in any browser. It never reaches the
// server, since browsers don't send what's after the #.
export const recoveryLink = (s: GmSession) => `${location.origin}${location.pathname}#gm=${s.code}.${s.gmKey}`;

export function readRecovery(hash: string): { code: string; gmKey: string } | undefined {
  const m = /^#gm=([A-Z0-9]{6})\.([0-9a-f]{32})$/i.exec(hash);
  return m ? { code: m[1]!.toUpperCase(), gmKey: m[2]!.toLowerCase() } : undefined;
}
