import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeDiff } from '../src/diff-engine';
import type { GeneratedFile } from '@repotune/schemas';

let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rt-diff-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

function makeFile(outputPath: string, content: string, strategy: GeneratedFile['strategy'] = 'create'): GeneratedFile {
  return { agentId: 'claude', outputPath, strategy, content, ruleIds: [] };
}

describe('computeDiff', () => {
  it('marks new files as hasChanges=true with null before', async () => {
    const result = await computeDiff([makeFile('CLAUDE.md', 'hello')], dir);
    expect(result.files[0].hasChanges).toBe(true);
    expect(result.files[0].before).toBeNull();
    expect(result.files[0].after).toBe('hello');
    expect(result.totalAdded).toBeGreaterThan(0);
  });

  it('marks unchanged files as hasChanges=false', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'hello', 'utf8');
    const result = await computeDiff([makeFile('CLAUDE.md', 'hello')], dir);
    expect(result.files[0].hasChanges).toBe(false);
    expect(result.totalUnchanged).toBe(1);
  });

  it('sorts output by agentId then outputPath', async () => {
    const files = [
      { ...makeFile('z.md', 'z'), agentId: 'copilot' as const },
      makeFile('a.md', 'a'),
    ];
    const result = await computeDiff(files, dir);
    expect(result.files[0].path).toBe('a.md');
    expect(result.files[1].path).toBe('z.md');
  });
});
