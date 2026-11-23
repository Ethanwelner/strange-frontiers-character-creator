// Game Master tables, shared by Player Tools and the Game Master tools. A table
// lives on the site (game-table-api.php in strange-frontiers-site, php/rpg/game-table.php),
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

// One line of the table's log: a chat message, a d20 roll, or the table's
// own note that someone joined or left. `seat` is the poster's seat id, "gm"
// for the Game Master, or null for the table's notes.
export interface LogEntry {
  id: number;
  at: number;
  kind: "chat" | "roll" | "join" | "leave" | "change";
  author: string;
  seat: string | null;
  text: string;
  value?: number;
}

// Keeps a page's copy of the log to the table's last 500, adding new entries.
export const LOG_KEEP = 500;
export function withEntries(log: LogEntry[], added: LogEntry[]): LogEntry[] {
  if (!added.length) return log;
  const seen = new Set(log.map((e) => e.id));
  const next = [...log, ...added.filter((e) => !seen.has(e.id))].sort((a, b) => a.id - b.id);
  return next.length > LOG_KEEP ? next.slice(-LOG_KEEP) : next;
}

// The Game Master adding a Trait to a player's character, at a rank, or
// taking one away. It waits on the table until the player's Player Tools
// applies it.
export interface GmChange {
  id: number;
  op: "add" | "remove";
  trait: string;
  rank: number;
}

export interface Seat {
  id: string;
  name: string;
  version: number;
  joined: number;
  seen: number;
  sheet?: SheetCopy;
  // The Game Master's changes still waiting for this player
  pending: GmChange[];
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
  // The last Game Master change Player Tools applied, which it tells the
  // table on its next check-in
  applied?: number;
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
export const gmPoll = (s: GmSession, known: Record<string, number>, since: number) =>
  call<{ table: TableInfo; now: number; seats: Seat[]; log: LogEntry[] }>("gm", { code: s.code, gmKey: s.gmKey, known, since });

export const joinTable = (code: string, name: string, sheet: SheetCopy) =>
  call<{ seatId: string; playerKey: string; table: TableInfo }>("join", { code, name, sheet });

// Checking in, with a new copy of the sheet when the character changed, and
// getting the log's entries after `since`.
export const syncSeat = (s: SeatSession, since: number, name?: string, sheet?: SheetCopy) =>
  call<{ table: TableInfo; version: number; log: LogEntry[]; changes: GmChange[] }>("sync", {
    code: s.code,
    seatId: s.seatId,
    playerKey: s.playerKey,
    since,
    ...(s.applied ? { ack: s.applied } : {}),
    ...(sheet ? { name, sheet } : {}),
  });

// The Game Master removes a player from the table (their character stays in
// their Player Tools), renames the table, or closes it for everyone.
export const kickSeat = (s: GmSession, seatId: string) => call<{ entry: LogEntry }>("kick", { code: s.code, gmKey: s.gmKey, seatId });
export const renameTable = (s: GmSession, name: string) => call<{ table: TableInfo; entry: LogEntry }>("rename", { code: s.code, gmKey: s.gmKey, name });
export const closeTable = (s: GmSession) => call<{ ok: true }>("close", { code: s.code, gmKey: s.gmKey });

// The Game Master adds a Trait to a player's character at `rank`, or takes
// one away. `name` is the Trait's name, for the log.
export const gmChange = (s: GmSession, seatId: string, op: GmChange["op"], trait: string, rank: number, name: string) =>
  call<{ change: GmChange; entry: LogEntry }>("change", { code: s.code, gmKey: s.gmKey, seatId, op, trait, rank, name });

// Who's posting to the log: the Game Master or a player's seat
type Poster = GmSession | SeatSession;
const posterOf = (p: Poster) => ("gmKey" in p ? { code: p.code, gmKey: p.gmKey } : { code: p.code, seatId: p.seatId, playerKey: p.playerKey });

export const say = (p: Poster, text: string) => call<{ entry: LogEntry }>("say", { ...posterOf(p), text });
export const rollToTable = (p: Poster, value: number) => call<{ entry: LogEntry }>("roll", { ...posterOf(p), value });

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
