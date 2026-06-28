import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Rule } from '@repotune/schemas';
import { claudeAdapter } from './index';

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
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'repotune-claude-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('claudeAdapter.plan', () => {
  it('global rule targets CLAUDE.md', async () => {
    const { generatedFiles } = await claudeAdapter.plan([rule()], dir);
    expect(generatedFiles[0].outputPath).toBe('CLAUDE.md');
  });

  it('path rule file has globs: key (not paths:) with quoted value', async () => {
    const { generatedFiles } = await claudeAdapter.plan(
      [rule({ scope: 'path', pathPattern: 'src/**/*.ts' })],
      dir,
    );
    const f = generatedFiles[0];
    expect(f.outputPath).toBe('.claude/rules/use-pnpm-a3f2.md');
    expect(f.content).toContain('globs: "src/**/*.ts"');
    expect(f.content).not.toContain('paths:');
  });

  it('path rule with pattern starting * has quoted value', async () => {
    const { generatedFiles } = await claudeAdapter.plan(
      [rule({ scope: 'path', pathPattern: '*.ts' })],
      dir,
    );
    expect(generatedFiles[0].content).toContain('globs: "*.ts"');
  });

  it('language rule emits CLAUDE_SCOPE_NOT_SUPPORTED_IN_V1 warning', async () => {
    const { generatedFiles, warnings } = await claudeAdapter.plan(
      [rule({ scope: 'language', language: 'typescript' })],
      dir,
    );
    expect(generatedFiles).toHaveLength(0);
    expect(warnings[0].code).toBe('CLAUDE_SCOPE_NOT_SUPPORTED_IN_V1');
  });
});
