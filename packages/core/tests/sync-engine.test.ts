import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSyncEngine } from '../src/sync-engine';
import { initRegistry, addRule } from '../src/registry';
import type { AgentAdapter, AgentId, GeneratedFile, Rule } from '@repotune/schemas';

let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rt-sync-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

function makeRule(id: string): Rule {
  const now = new Date().toISOString();
  return { id, content: `# ${id}`, scope: 'global', createdAt: now, updatedAt: now };
}

function makeAdapter(agentId: AgentId, files: GeneratedFile[]): AgentAdapter {
  return {
    agentId,
    capabilities: {
      agentId,
      supportsGlobalRules: true,
      supportsPathRules: false,
      supportsLanguageRules: false,
      supportsFrameworkRules: false,
      supportsImports: false,
      supportsSymlinks: false,
      managedBlockMarker: { start: `<!-- repotune:start ${agentId} -->`, end: `<!-- repotune:end ${agentId} -->` },
    },
    plan: async () => ({ generatedFiles: files, warnings: [] }),
    validate: async () => [],
  };
}

describe('planSync', () => {
  it('returns diff and plan with no conflicts for simple rules', async () => {
    await initRegistry(dir, ['claude']);
    const rule = makeRule('no-any');
    const file: GeneratedFile = { agentId: 'claude', outputPath: 'CLAUDE.md', strategy: 'create', content: rule.content, ruleIds: [rule.id] };
    const adapters = new Map<AgentId, AgentAdapter>([['claude', makeAdapter('claude', [file])]]);
    const engine = createSyncEngine(adapters);

    const preview = await engine.planSync([rule], { agents: ['claude'], repoRoot: dir });
    expect(preview.plan.generatedFiles).toHaveLength(1);
    expect(preview.plan.conflicts).toHaveLength(0);
    expect(preview.diff.files[0].hasChanges).toBe(true);
  });
});

describe('applySync', () => {
  it('writes file and returns applied=true on happy path', async () => {
    await initRegistry(dir, ['claude']);
    const rule = makeRule('no-any');
    await addRule(rule, dir);

    const file: GeneratedFile = { agentId: 'claude', outputPath: 'CLAUDE.md', strategy: 'create', content: rule.content, ruleIds: [rule.id] };
    const adapters = new Map<AgentId, AgentAdapter>([['claude', makeAdapter('claude', [file])]]);
    const engine = createSyncEngine(adapters);

    const preview = await engine.planSync([rule], { agents: ['claude'], repoRoot: dir });
    const result = await engine.applySync(preview, { agents: ['claude'], repoRoot: dir });

    expect(result.applied).toBe(true);
    expect(await readFile(join(dir, 'CLAUDE.md'), 'utf8')).toBe(rule.content);
  });

  it('returns applied=false when diff has changed between plan and apply', async () => {
    await initRegistry(dir, ['claude']);
    const rule = makeRule('no-any');
    await addRule(rule, dir);

    const file: GeneratedFile = { agentId: 'claude', outputPath: 'CLAUDE.md', strategy: 'create', content: rule.content, ruleIds: [rule.id] };
    const adapters = new Map<AgentId, AgentAdapter>([['claude', makeAdapter('claude', [file])]]);
    const engine = createSyncEngine(adapters);

    const preview = await engine.planSync([rule], { agents: ['claude'], repoRoot: dir });

    // Simulate filesystem change between plan and apply
    await writeFile(join(dir, 'CLAUDE.md'), 'external change', 'utf8');

    const result = await engine.applySync(preview, { agents: ['claude'], repoRoot: dir });
    expect(result.applied).toBe(false);
  });
});
