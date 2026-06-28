import { access, copyFile, mkdir, readdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BackupManifestSchema } from '@repotune/schemas';
import type { BackupManifest, GeneratedFile } from '@repotune/schemas';

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function rmEmptyParents(dir: string, root: string): Promise<void> {
  if (!dir.startsWith(root) || dir === root) return;
  try {
    if ((await readdir(dir)).length === 0) {
      await rmdir(dir);
      await rmEmptyParents(dirname(dir), root);
    }
  } catch { /* ignore */ }
}

export async function createBackup(files: GeneratedFile[], repoRoot: string): Promise<string> {
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const backupDir = join(repoRoot, '.ai', '.backups', ts);
  await mkdir(backupDir, { recursive: true });

  const modifiedFiles: string[] = [];
  const createdFiles: string[] = [];

  for (const file of files) {
    const src = join(repoRoot, file.outputPath);
    if (await exists(src)) {
      modifiedFiles.push(file.outputPath);
      const dest = join(backupDir, file.outputPath);
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(src, dest);
    } else {
      createdFiles.push(file.outputPath);
    }
  }

  const manifest: BackupManifest = { createdAt: new Date().toISOString(), createdFiles, modifiedFiles };
  await writeFile(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return backupDir;
}

export async function restoreBackup(backupPath: string, repoRoot: string): Promise<void> {
  const manifest = BackupManifestSchema.parse(
    JSON.parse(await readFile(join(backupPath, 'manifest.json'), 'utf8')),
  );
  for (const rel of manifest.modifiedFiles) {
    const dest = join(repoRoot, rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(backupPath, rel), dest);
  }
  for (const rel of manifest.createdFiles) {
    const p = join(repoRoot, rel);
    try { await unlink(p); await rmEmptyParents(dirname(p), repoRoot); } catch { /* already gone */ }
  }
}

export async function listBackups(repoRoot: string): Promise<string[]> {
  const dir = join(repoRoot, '.ai', '.backups');
  try {
    return (await readdir(dir)).map(e => join(dir, e)).sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}
