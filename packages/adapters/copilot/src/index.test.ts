import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Rule } from '@repotune/schemas';
import { copilotAdapter } from './index';

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'use-pnpm-a3f2',
    content: 'Use pnpm, never npm.',
    scope: 'global',
    createdAt: '2024-01-15T10:05:00Z',
    updatedAt: '2024-01-15T10:05:00Z',
    ...overrides,
  };
}

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'repotune-copilot-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('copilotAdapter.plan', () => {
  it('global rule targets .github/copilot-instructions.md', async () => {
    const { generatedFiles } = await copilotAdapter.plan([rule()], dir);
    expect(generatedFiles[0].outputPath).toBe('.github/copilot-instructions.md');
  });

  it('path rule file has applyTo: frontmatter', async () => {
    const { generatedFiles } = await copilotAdapter.plan(
      [rule({ scope: 'path', pathPattern: 'src/**/*.ts' })],
      dir,
    );
    const f = generatedFiles[0];
    expect(f.outputPath).toBe('.github/instructions/use-pnpm-a3f2.instructions.md');
    expect(f.content).toContain('applyTo: "src/**/*.ts"');
  });

  it('path rule without pathPattern emits warning and skips file', async () => {
    // Bypasses schema validation to test defensive guard in adapter
    const badRule = {
      id: 'bad-rule',
      content: 'test',
      scope: 'path',
      createdAt: '2024-01-15T10:05:00Z',
      updatedAt: '2024-01-15T10:05:00Z',
    } as Rule;

    const { generatedFiles, warnings } = await copilotAdapter.plan([badRule], dir);
    expect(generatedFiles).toHaveLength(0);
    expect(warnings[0].code).toBe('COPILOT_MISSING_PATH_PATTERN');
  });
});
