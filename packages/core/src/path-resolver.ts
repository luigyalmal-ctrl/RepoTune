import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export function findRepoRoot(fromDir: string): string {
  let dir = fromDir;
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return fromDir; // filesystem root — no .git found
    dir = parent;
  }
}

export function toRepoRelative(absolutePath: string, repoRoot: string): string {
  return relative(repoRoot, absolutePath).replace(/\\/g, '/');
}

export function toAbsolute(repoRelativePath: string, repoRoot: string): string {
  return join(repoRoot, ...repoRelativePath.split('/'));
}
