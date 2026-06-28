import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadLock, saveLock } from '../src/lock';
import type { LockFile } from '@repotune/schemas';

let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rt-lock-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const lock: LockFile = {
  version: '0.1.2',
  lastSyncAt: '2024-01-01T00:00:00.000Z',
  generatedFiles: [],
};

describe('loadLock', () => {
  it('returns null when file is missing', async () => {
    expect(await loadLock(dir)).toBeNull();
  });

  it('round-trips through saveLock', async () => {
    await saveLock(lock, dir);
    expect(await loadLock(dir)).toEqual(lock);
  });
});
