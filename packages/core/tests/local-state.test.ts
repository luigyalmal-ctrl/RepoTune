import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadLocalState, saveLocalState } from '../src/local-state';

let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rt-state-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('loadLocalState', () => {
  it('returns empty object when missing', async () => {
    expect(await loadLocalState(dir)).toEqual({});
  });

  it('round-trips through saveLocalState', async () => {
    const state = { lastBackupPath: '/foo', lastSyncAt: '2024-01-01T00:00:00.000Z' };
    await saveLocalState(state, dir);
    expect(await loadLocalState(dir)).toEqual(state);
  });
});
