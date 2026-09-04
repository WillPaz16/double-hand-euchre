import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { createRoom, join } from '../shared/net/room.ts';
import { DEFAULT_CONFIG } from '../shared/engine/index.ts';
import { loadRooms, saveRooms } from '../server/store.ts';

/** `store.ts` resolves ROOMS_FILE per call, so pointing it at a temp file is just setting the
 *  env var — no module re-import games. It did read the path once at module load, which made
 *  these tests need a dynamic import that Vite refuses to resolve; the fix went into the source
 *  rather than the test, because load-time env reads are order-dependent in production too. */
let dir: string;

function useStoreFile(file: string) {
  process.env.ROOMS_FILE = file;
  return { saveRooms, loadRooms };
}

beforeEach(() => {
  dir = mkdtempSync(joinPath(tmpdir(), 'euchre-store-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.ROOMS_FILE;
});

describe('room persistence', () => {
  it('round-trips a room through save and load', () => {
    const file = joinPath(dir, 'rooms.json');
    const store = useStoreFile(file);

    const seated = join(createRoom('AB2C', 'seed-store', DEFAULT_CONFIG), 'client-a', 'Ada');
    if (!seated.ok) throw new Error(seated.error);

    store.saveRooms(new Map([['AB2C', seated.value.room]]));
    const loaded = store.loadRooms();

    const back = loaded.get('AB2C');
    expect(back).toBeDefined();
    expect(back!.state.phase).toBe('select');
    expect(back!.seats.A).toBe('client-a');
    expect(back!.names.A).toBe('Ada');
  });

  it('always restores seats as DISCONNECTED', () => {
    // A socket cannot outlive the process. Restoring `connected: true` would make the server
    // tell the other player their opponent is present when nobody is on the wire at all.
    const file = joinPath(dir, 'rooms.json');
    const store = useStoreFile(file);

    const seated = join(createRoom('AB2C', 'seed-store', DEFAULT_CONFIG), 'client-a');
    if (!seated.ok) throw new Error(seated.error);
    expect(seated.value.room.connected.A).toBe(true); // live in memory

    store.saveRooms(new Map([['AB2C', seated.value.room]]));
    expect(store.loadRooms().get('AB2C')!.connected.A).toBe(false);
  });

  it('starts empty rather than throwing when there is no snapshot', () => {
    const store = useStoreFile(joinPath(dir, 'does-not-exist.json'));
    expect(store.loadRooms().size).toBe(0);
  });

  it('discards an unreadable snapshot instead of failing to start', () => {
    const file = joinPath(dir, 'rooms.json');
    writeFileSync(file, '{ this is not json', 'utf8');
    const store = useStoreFile(file);
    expect(store.loadRooms().size).toBe(0);
  });

  it('discards a snapshot written by a different version', () => {
    const file = joinPath(dir, 'rooms.json');
    writeFileSync(file, JSON.stringify({ version: 999, savedAt: '', rooms: [] }), 'utf8');
    const store = useStoreFile(file);
    expect(store.loadRooms().size).toBe(0);
  });

  it('drops rooms that are too old to be worth restoring', () => {
    const file = joinPath(dir, 'rooms.json');
    const seated = join(createRoom('AB2C', 'seed-store', DEFAULT_CONFIG), 'client-a');
    if (!seated.ok) throw new Error(seated.error);
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        // A day old: well past the 6-hour cutoff.
        rooms: [{ room: seated.value.room, savedAt: Date.now() - 24 * 60 * 60 * 1000 }],
      }),
      'utf8',
    );
    const store = useStoreFile(file);
    expect(store.loadRooms().size).toBe(0);
  });
});
