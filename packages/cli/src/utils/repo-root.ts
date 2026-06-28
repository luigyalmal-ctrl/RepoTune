import { findRepoRoot } from '@repotune/core';

export function getRepoRoot(): string {
  return findRepoRoot(process.cwd());
}
