import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackup, listBackups, restoreBackup } from '../src/backup-manager';
import type { GeneratedFile } from '@repotune/schemas';

let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rt-bak-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

function makeFile(outputPath: string, content = 'hello'): GeneratedFile {
  return { agentId: 'claude', outputPath, strategy: 'create', content, ruleIds: [] };
}

describe('createBackup', () => {
  it('creates manifest with modifiedFiles for existing files, createdFiles for new', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'existing', 'utf8');
    const files = [makeFile('CLAUDE.md'), makeFile('AGENTS.md')];
    const backupPath = await createBackup(files, dir);

    const manifest = JSON.parse(await readFile(join(backupPath, 'manifest.json'), 'utf8'));
    expect(manifest.modifiedFiles).toContain('CLAUDE.md');
    expect(manifest.createdFiles).toContain('AGENTS.md');
  });

  it('copies existing file into backup dir', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'content', 'utf8');
    const bp = await createBackup([makeFile('CLAUDE.md')], dir);
    const copy = await readFile(join(bp, 'CLAUDE.md'), 'utf8');
    expect(copy).toBe('content');
  });
});

describe('restoreBackup', () => {
  it('restores modified files and removes created files', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'original', 'utf8');
    const files = [makeFile('CLAUDE.md'), makeFile('AGENTS.md')];
    const bp = await createBackup(files, dir);

    // Simulate sync: overwrite CLAUDE.md and create AGENTS.md
    await writeFile(join(dir, 'CLAUDE.md'), 'modified', 'utf8');
    await writeFile(join(dir, 'AGENTS.md'), 'new', 'utf8');

    await restoreBackup(bp, dir);

    expect(await readFile(join(dir, 'CLAUDE.md'), 'utf8')).toBe('original');
    await expect(readFile(join(dir, 'AGENTS.md'), 'utf8')).rejects.toThrow();
  });
});

describe('listBackups', () => {
  it('returns empty array when no backups', async () => {
    expect(await listBackups(dir)).toEqual([]);
  });

  it('returns backups sorted descending', async () => {
    const bp1 = await createBackup([], dir);
    await new Promise(r => setTimeout(r, 1100)); // ensure different timestamps
    const bp2 = await createBackup([], dir);
    const list = await listBackups(dir);
    expect(list[0]).toBe(bp2);
    expect(list[1]).toBe(bp1);
  });
});
