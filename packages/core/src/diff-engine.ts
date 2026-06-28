import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { diffLines } from 'diff';
import type { DiffResult, FileDiff, GeneratedFile } from '@repotune/schemas';
import { render } from './managed-block-renderer';

export async function computeDiff(files: GeneratedFile[], repoRoot: string): Promise<DiffResult> {
  const sorted = [...files].sort((a, b) => {
    const d = a.agentId.localeCompare(b.agentId);
    return d !== 0 ? d : a.outputPath.localeCompare(b.outputPath);
  });

  let totalAdded = 0;
  let totalRemoved = 0;
  let totalUnchanged = 0;
  const fileDiffs: FileDiff[] = [];

  for (const file of sorted) {
    let before: string | null = null;
    try { before = await readFile(join(repoRoot, file.outputPath), 'utf8'); } catch { /* new file */ }

    const after = render(file, before);
    const hasChanges = before !== after;

    if (hasChanges) {
      const changes = diffLines(before ?? '', after);
      totalAdded += changes.filter(c => c.added).reduce((s, c) => s + (c.count ?? 0), 0);
      totalRemoved += changes.filter(c => c.removed).reduce((s, c) => s + (c.count ?? 0), 0);
    } else {
      totalUnchanged++;
    }

    fileDiffs.push({ path: file.outputPath, before, after, hasChanges });
  }

  return { files: fileDiffs, totalAdded, totalRemoved, totalUnchanged };
}
