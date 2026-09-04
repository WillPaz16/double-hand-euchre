import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { Room } from '../shared/net/room.ts';

/** Where rooms are kept between restarts. A file, not a database, because the whole dataset is
 *  "a handful of card games currently in progress" — small, short-lived, and worthless an hour
 *  after it is written. A database would be more infrastructure than the thing it stores.
 *
 *  Resolved per call rather than once at module load. That started as a testability problem —
 *  a load-time `const` cannot be pointed at a temp file without re-importing the module — but
 *  it is also the more correct behaviour: env read at import time silently ignores anything
 *  configured after this module is first pulled in, which depends on import order rather than
 *  on anything a reader can see. */
function roomsFile(): string {
  return process.env.ROOMS_FILE ?? '.rooms.json';
}

/** Bumped when the on-disk shape changes. A snapshot from an older server is DISCARDED rather
 *  than migrated: these are in-progress card games, not records worth preserving, and silently
 *  loading a room whose GameState no longer matches the engine would corrupt a live game in
 *  ways far more confusing than starting a fresh one. */
const VERSION = 1;

/** Rooms older than this are dropped on load. Without it, every abandoned game ever started
 *  comes back from the dead on each restart and accumulates forever. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

interface Snapshot {
  version: number;
  savedAt: string;
  rooms: { room: Room; savedAt: number }[];
}

/** Persists the room map.
 *
 *  Written to a temp file and renamed, because `rename` is atomic on POSIX: a crash midway
 *  through leaves the previous good snapshot intact rather than a half-written file that fails
 *  to parse and takes every live game with it. Sockets are deliberately NOT saved — they cannot
 *  outlive the process, and every seat comes back marked disconnected, which is exactly true
 *  until each player's client reconnects. */
export function saveRooms(rooms: Map<string, Room>): void {
  const snapshot: Snapshot = {
    version: VERSION,
    savedAt: new Date().toISOString(),
    rooms: [...rooms.values()].map((room) => ({
      room: { ...room, connected: { A: false, B: false } },
      savedAt: Date.now(),
    })),
  };
  try {
    const file = roomsFile();
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot), 'utf8');
    renameSync(tmp, file);
  } catch (e) {
    // Never let a failed save take the server down: an unwritable disk should cost you
    // persistence, not the games currently being played in memory.
    console.error('could not save rooms:', e);
  }
}

/** Restores the room map, or an empty one if there is nothing usable to restore. Every failure
 *  path returns empty rather than throwing, for the same reason: a corrupt or stale snapshot
 *  must not stop the server from starting. */
export function loadRooms(): Map<string, Room> {
  const rooms = new Map<string, Room>();
  let raw: string;
  try {
    raw = readFileSync(roomsFile(), 'utf8');
  } catch {
    return rooms; // no snapshot yet — the ordinary first-boot case
  }

  let snapshot: Snapshot;
  try {
    snapshot = JSON.parse(raw) as Snapshot;
  } catch {
    console.error('rooms snapshot was unreadable; starting empty');
    return rooms;
  }

  if (snapshot.version !== VERSION) {
    console.warn(`rooms snapshot is version ${snapshot.version}, expected ${VERSION}; discarding`);
    return rooms;
  }

  const now = Date.now();
  let dropped = 0;
  for (const entry of snapshot.rooms ?? []) {
    if (!entry?.room?.code || now - entry.savedAt > MAX_AGE_MS) {
      dropped++;
      continue;
    }
    rooms.set(entry.room.code, { ...entry.room, connected: { A: false, B: false } });
  }
  console.log(`restored ${rooms.size} room(s)${dropped ? `, dropped ${dropped} stale` : ''}`);
  return rooms;
}
