import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSyncEngine, loadLock, restoreBackup } from '@repotune/core';
import { ALL_ADAPTERS, doSync, makeRule, setupRepo } from './helpers';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rt-sync-int-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

// I-05: sync --dry-run → zero files written, correct DiffResult
describe('I-05: dry-run writes nothing', () => {
  it('planSync writes zero files', async () => {
    await setupRepo(dir);
    const rules = [makeRule('use-pnpm')];
    const engine = createSyncEngine(ALL_ADAPTERS);
    await engine.planSync(rules, { agents: ['claude'], repoRoot: dir });
    // CLAUDE.md should not exist — planSync is read-only
    await expect(access(join(dir, 'CLAUDE.md'))).rejects.toThrow();
  });

  it('DiffResult shows hasChanges=true for new files', async () => {
    await setupRepo(dir);
    const rules = [makeRule('use-pnpm')];
    const engine = createSyncEngine(ALL_ADAPTERS);
    const preview = await engine.planSync(rules, { agents: ['claude'], repoRoot: dir });
    expect(preview.diff.files.some(f => f.hasChanges)).toBe(true);
    expect(preview.diff.files.some(f => f.before === null)).toBe(true);
  });
});

// I-06: sync full → all adapters write correct files, lock.json updated, backup created
describe('I-06: full sync', () => {
  it('writes files for all 4 adapters and updates lock', async () => {
    await setupRepo(dir);
    const rules = [makeRule('use-pnpm')];
    const { applied } = await doSync(dir, rules);
    expect(applied).toBe(true);

    await expect(readFile(join(dir, 'CLAUDE.md'), 'utf8')).resolves.toBeTruthy();
    await expect(readFile(join(dir, 'AGENTS.md'), 'utf8')).resolves.toBeTruthy();
    await expect(readFile(join(dir, '.github', 'copilot-instructions.md'), 'utf8')).resolves.toBeTruthy();

    const lock = await loadLock(dir);
    expect(lock).not.toBeNull();
    expect(lock!.generatedFiles.length).toBeGreaterThan(0);
  });

  it('creates backup directory', async () => {
    await setupRepo(dir);
    const { applied } = await doSync(dir, [makeRule('use-pnpm')]);
    expect(applied).toBe(true);
    await expect(access(join(dir, '.ai', '.backups'))).resolves.toBeUndefined();
  });
});

// I-07: sync twice, same rules → second sync: all hasChanges: false
describe('I-07: idempotent sync', () => {
  it('second sync reports no changes', async () => {
    await setupRepo(dir);
    const rules = [makeRule('use-pnpm')];
    await doSync(dir, rules);

    const engine = createSyncEngine(ALL_ADAPTERS);
    const preview2 = await engine.planSync(rules, { agents: ['claude', 'copilot', 'cursor', 'agents-md'], repoRoot: dir });
    expect(preview2.diff.files.every(f => !f.hasChanges)).toBe(true);
  });
});

// I-08: sync + rollback → modifiedFiles restored byte-identical; createdFiles deleted
describe('I-08: sync then rollback', () => {
  it('restores modified files and deletes created files', async () => {
    await setupRepo(dir, ['claude']);
    const originalContent = '# Original manual content\n\nKeep this.\n';
    await writeFile(join(dir, 'CLAUDE.md'), originalContent, 'utf8');

    const { applied, backupPath } = await doSync(dir, [makeRule('use-pnpm')], ['claude']);
    expect(applied).toBe(true);

    await restoreBackup(backupPath, dir);

    // CLAUDE.md restored to original
    const restored = await readFile(join(dir, 'CLAUDE.md'), 'utf8');
    expect(restored).toBe(originalContent);
  });

  it('created files are deleted by rollback', async () => {
    await setupRepo(dir, ['agents-md']);
    const { applied, backupPath } = await doSync(dir, [makeRule('use-pnpm')], ['agents-md']);
    expect(applied).toBe(true);

    await expect(access(join(dir, 'AGENTS.md'))).resolves.toBeUndefined();
    await restoreBackup(backupPath, dir);
    await expect(access(join(dir, 'AGENTS.md'))).rejects.toThrow();
  });
});

// I-09: sync with pre-existing CLAUDE.md → manual content preserved outside block
describe('I-09: manual content preserved outside block', () => {
  it('preserves content outside managed block byte-identical', async () => {
    await setupRepo(dir, ['claude']);
    const header = '# My Project Instructions\n\nThese are my manual notes.\n\n';
    const footer = '\n\n## More manual content\n\nKeep this too.\n';
    await writeFile(join(dir, 'CLAUDE.md'), `${header}${footer}`, 'utf8');

    const { applied } = await doSync(dir, [makeRule('use-pnpm')], ['claude']);
    expect(applied).toBe(true);

    const result = await readFile(join(dir, 'CLAUDE.md'), 'utf8');
    expect(result).toContain(header);
    expect(result).toContain(footer.trim());
    expect(result).toContain('<!-- repotune:start claude -->');
    expect(result).toContain('<!-- repotune:end claude -->');
  });
});

// I-10: sync with CLAUDE.md already has block → after sync: exactly one block
describe('I-10: sync with existing managed block', () => {
  it('updates block in place — exactly one block after sync', async () => {
    await setupRepo(dir, ['claude']);
    const marker = { start: '<!-- repotune:start claude -->', end: '<!-- repotune:end claude -->' };
    const existing = `Before\n${marker.start}\nOld content\n${marker.end}\nAfter\n`;
    await writeFile(join(dir, 'CLAUDE.md'), existing, 'utf8');

    const { applied } = await doSync(dir, [makeRule('new-rule')], ['claude']);
    expect(applied).toBe(true);

    const result = await readFile(join(dir, 'CLAUDE.md'), 'utf8');
    expect(result.split(marker.start).length - 1).toBe(1);
    expect(result.split(marker.end).length - 1).toBe(1);
    expect(result).toContain('Before');
    expect(result).toContain('After');
    expect(result).not.toContain('Old content');
  });
});

// I-14: sync with conflicting rules → conflicts non-empty
describe('I-14: conflicting rules block sync', () => {
  it('planSync returns non-empty conflicts for contradictory rules', async () => {
    await setupRepo(dir);
    const now = new Date().toISOString();
    const rules = [
      { id: 'rule-a', content: 'Use pnpm.', scope: 'global' as const, createdAt: now, updatedAt: now },
      { id: 'rule-b', content: 'Use npm.', scope: 'global' as const, createdAt: now, updatedAt: now },
    ];
    const engine = createSyncEngine(ALL_ADAPTERS);
    const preview = await engine.planSync(rules, { agents: ['claude'], repoRoot: dir });
    expect(preview.plan.conflicts.length).toBeGreaterThan(0);
  });

  it('applySync aborts when conflicts exist', async () => {
    await setupRepo(dir);
    const now = new Date().toISOString();
    const rules = [
      { id: 'rule-a', content: 'Use pnpm.', scope: 'global' as const, createdAt: now, updatedAt: now },
      { id: 'rule-b', content: 'Use npm.', scope: 'global' as const, createdAt: now, updatedAt: now },
    ];
    const engine = createSyncEngine(ALL_ADAPTERS);
    const preview = await engine.planSync(rules, { agents: ['claude'], repoRoot: dir });
    // Save conflicting rules to registry so applySync can re-load them
    const { initRegistry, addRule, saveLock } = await import('@repotune/core');
    await initRegistry(dir, ['claude']);
    for (const r of rules) await addRule(r, dir);
    await saveLock({ version: '0.1.2', lastSyncAt: now, generatedFiles: [] }, dir);

    const result = await engine.applySync(preview, { agents: ['claude'], repoRoot: dir });
    expect(result.applied).toBe(false);
  });
});

// I-15: sync --yes with conflicting rules → still does not apply (engine-level check)
describe('I-15: --yes does not bypass conflicts', () => {
  it('applySync always aborts on conflicts regardless of caller flags', async () => {
    // This is the same test as I-14's applySync check — the engine has no --yes concept.
    // --yes only skips the CLI confirm() prompt. The engine always checks conflicts.
    await setupRepo(dir);
    const now = new Date().toISOString();
    const rules = [
      { id: 'r1', content: 'Use vitest.', scope: 'global' as const, createdAt: now, updatedAt: now },
      { id: 'r2', content: 'Use jest.', scope: 'global' as const, createdAt: now, updatedAt: now },
    ];
    const { initRegistry, addRule, saveLock } = await import('@repotune/core');
    await initRegistry(dir, ['claude']);
    for (const r of rules) await addRule(r, dir);
    await saveLock({ version: '0.1.2', lastSyncAt: now, generatedFiles: [] }, dir);

    const engine = createSyncEngine(ALL_ADAPTERS);
    const preview = await engine.planSync(rules, { agents: ['claude'], repoRoot: dir });
    expect(preview.plan.conflicts.length).toBeGreaterThan(0);

    const result = await engine.applySync(preview, { agents: ['claude'], repoRoot: dir });
    expect(result.applied).toBe(false);
    // CLAUDE.md was never written
    await expect(access(join(dir, 'CLAUDE.md'))).rejects.toThrow();
  });
});

// I-20: create strategy on file not in lock → warning emitted, file not overwritten
describe('I-20: create strategy does not overwrite unmanaged files', () => {
  it('emits warning and does not overwrite file not in lock', async () => {
    await setupRepo(dir);
    // Pre-create CLAUDE.md with content not in lock
    await writeFile(join(dir, 'CLAUDE.md'), 'Manual untracked content', 'utf8');

    // lock is empty (file not tracked)
    const rules = [makeRule('use-pnpm')];
    const engine = createSyncEngine(ALL_ADAPTERS);
    const preview = await engine.planSync(rules, { agents: ['claude'], repoRoot: dir });
    // claude adapter sees CLAUDE.md exists → uses managed-block strategy
    // (not 'create') so the file should be updated safely
    // But if strategy were 'create' and file not in lock → warning + skip

    // For the actual create-strategy test, use file-writer directly:
    const { writeGeneratedFile, loadLock } = await import('@repotune/core');
    const lockFile = await loadLock(dir); // no CLAUDE.md in lock
    const warnings = await writeGeneratedFile(
      { agentId: 'claude', outputPath: 'CLAUDE.md', strategy: 'create', content: 'new content', ruleIds: [] },
      dir,
      lockFile,
    );
    expect(warnings.some(w => w.code === 'FILE_EXISTS_NOT_IN_LOCK')).toBe(true);
    // File content should be unchanged
    const content = await readFile(join(dir, 'CLAUDE.md'), 'utf8');
    expect(content).toBe('Manual untracked content');
  });
});
