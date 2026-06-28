import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSafe, writeGeneratedFile } from '../src/file-writer';
import type { GeneratedFile } from '@repotune/schemas';

let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rt-fw-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

function makeFile(overrides: Partial<GeneratedFile> = {}): GeneratedFile {
  return { agentId: 'claude', outputPath: 'CLAUDE.md', strategy: 'create', content: 'hello', ruleIds: [], ...overrides };
}

describe('readFileSafe', () => {
  it('returns null for missing file', async () => {
    expect(await readFileSafe(join(dir, 'missing.md'))).toBeNull();
  });

  it('returns content for existing file', async () => {
    await writeFile(join(dir, 'x.md'), 'yo', 'utf8');
    expect(await readFileSafe(join(dir, 'x.md'))).toBe('yo');
  });
});

describe('writeGeneratedFile', () => {
  it('skips strategy=skip', async () => {
    const warnings = await writeGeneratedFile(makeFile({ strategy: 'skip' }), dir, null);
    expect(warnings).toHaveLength(0);
    await expect(readFile(join(dir, 'CLAUDE.md'), 'utf8')).rejects.toThrow();
  });

  it('creates new file with strategy=create', async () => {
    await writeGeneratedFile(makeFile({ strategy: 'create' }), dir, null);
    expect(await readFile(join(dir, 'CLAUDE.md'), 'utf8')).toBe('hello');
  });

  it('warns when strategy=create but file exists and is not in lock', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'existing', 'utf8');
    const warnings = await writeGeneratedFile(makeFile({ strategy: 'create' }), dir, null);
    expect(warnings[0]?.code).toBe('FILE_EXISTS_NOT_IN_LOCK');
  });

  it('warns when strategy=overwrite but file is not in lock', async () => {
    const warnings = await writeGeneratedFile(makeFile({ strategy: 'overwrite' }), dir, null);
    expect(warnings[0]?.code).toBe('FILE_NOT_IN_LOCK');
  });

  it('skips write when content is byte-identical', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'hello', 'utf8');
    const warnings = await writeGeneratedFile(makeFile({ strategy: 'create' }), dir, {
      version: '0.1.2', lastSyncAt: '2024-01-01T00:00:00.000Z',
      generatedFiles: [{ path: 'CLAUDE.md', agentId: 'claude', strategy: 'create', checksum: '', checksumMode: 'full-file', ruleIds: [], syncedAt: '2024-01-01T00:00:00.000Z' }],
    });
    expect(warnings).toHaveLength(0);
  });

  it('injects managed-block into existing file', async () => {
    const marker = { start: '<!-- repotune:start claude -->', end: '<!-- repotune:end claude -->' };
    const existing = `header\n${marker.start}\nold\n${marker.end}\nfooter`;
    await writeFile(join(dir, 'CLAUDE.md'), existing, 'utf8');
    const file = makeFile({ strategy: 'managed-block', content: 'new', managedBlockMarker: marker });
    await writeGeneratedFile(file, dir, {
      version: '0.1.2', lastSyncAt: '2024-01-01T00:00:00.000Z',
      generatedFiles: [{ path: 'CLAUDE.md', agentId: 'claude', strategy: 'managed-block', checksum: '', checksumMode: 'managed-block', ruleIds: [], syncedAt: '2024-01-01T00:00:00.000Z' }],
    });
    const result = await readFile(join(dir, 'CLAUDE.md'), 'utf8');
    expect(result).toContain('new');
    expect(result).toContain('header');
    expect(result).toContain('footer');
    expect(result).not.toContain('old');
  });
});
