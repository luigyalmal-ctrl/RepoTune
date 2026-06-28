import { createHash } from 'node:crypto';
import type {
  AgentAdapter,
  AgentId,
  DiffResult,
  GeneratedFile,
  LockGeneratedFile,
  Rule,
  SyncPreview,
  Warning,
} from '@repotune/schemas';
import { createBackup } from './backup-manager';
import { detectConflicts } from './conflict-detector';
import { computeDiff } from './diff-engine';
import { writeGeneratedFile } from './file-writer';
import { loadLock, saveLock } from './lock';
import { saveLocalState } from './local-state';
import { loadRegistry } from './registry';

export interface SyncOptions {
  agents: AgentId[];
  repoRoot: string;
}

export interface SyncResult {
  applied: boolean;
  backupPath: string;
  generatedFiles: LockGeneratedFile[];
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function diffsEqual(a: DiffResult, b: DiffResult): boolean {
  if (a.files.length !== b.files.length) return false;
  const sort = (fs: DiffResult['files']) => [...fs].sort((x, y) => x.path.localeCompare(y.path));
  const af = sort(a.files);
  const bf = sort(b.files);
  return af.every((f, i) =>
    f.path === bf[i].path &&
    f.before === bf[i].before &&
    f.after === bf[i].after &&
    f.hasChanges === bf[i].hasChanges,
  );
}

export function createSyncEngine(adapters: Map<AgentId, AgentAdapter>) {
  async function planSync(rules: Rule[], opts: SyncOptions): Promise<SyncPreview> {
    const allFiles: GeneratedFile[] = [];
    const allWarnings: Warning[] = [];

    for (const id of opts.agents) {
      const adapter = adapters.get(id);
      if (!adapter) continue;
      const r = await adapter.plan(rules, opts.repoRoot);
      allFiles.push(...r.generatedFiles);
      allWarnings.push(...r.warnings);
    }

    return {
      plan: {
        agentIds: opts.agents,
        generatedFiles: allFiles,
        conflicts: detectConflicts(rules),
        warnings: allWarnings,
      },
      diff: await computeDiff(allFiles, opts.repoRoot),
    };
  }

  async function applySync(preview: SyncPreview, opts: SyncOptions): Promise<SyncResult> {
    const empty: SyncResult = { applied: false, backupPath: '', generatedFiles: [] };

    const { rules } = await loadRegistry(opts.repoRoot);
    const fresh = await planSync(rules, opts);

    if (!diffsEqual(fresh.diff, preview.diff)) return empty;
    if (fresh.plan.conflicts.length > 0) return empty;

    const { generatedFiles } = preview.plan;
    const lockFile = await loadLock(opts.repoRoot);
    const backupPath = await createBackup(generatedFiles, opts.repoRoot);

    const changedPaths = new Set(preview.diff.files.filter(f => f.hasChanges).map(f => f.path));
    for (const file of generatedFiles) {
      if (changedPaths.has(file.outputPath)) await writeGeneratedFile(file, opts.repoRoot, lockFile);
    }

    const now = new Date().toISOString();
    const lockEntries: LockGeneratedFile[] = generatedFiles.map(file => {
      const mode = file.strategy === 'managed-block' ? 'managed-block' : 'full-file';
      const diffFile = fresh.diff.files.find(f => f.path === file.outputPath);
      const checksumSrc = mode === 'managed-block' ? file.content : (diffFile?.after ?? file.content);
      return {
        path: file.outputPath,
        agentId: file.agentId,
        strategy: file.strategy,
        checksum: sha256(checksumSrc),
        checksumMode: mode,
        ruleIds: file.ruleIds,
        syncedAt: now,
      };
    });

    await saveLock({ version: '0.1.2', lastSyncAt: now, generatedFiles: lockEntries }, opts.repoRoot);
    await saveLocalState({ lastBackupPath: backupPath, lastSyncAt: now }, opts.repoRoot);

    return { applied: true, backupPath, generatedFiles: lockEntries };
  }

  return { planSync, applySync };
}
