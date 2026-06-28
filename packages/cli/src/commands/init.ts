import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkbox, confirm } from '@inquirer/prompts';
import { initRegistry, saveLock, saveLocalState } from '@repotune/core';
import type { AgentId } from '@repotune/schemas';

const GI_START = '<!-- repotune:start gitignore -->';
const GI_END = '<!-- repotune:end gitignore -->';
const GI_CONTENT = '# RepoTune local state\n.ai/.backups/\n.ai/state.local.json';

function patchGitignore(current: string | null): string {
  const block = `${GI_START}\n${GI_CONTENT}\n${GI_END}`;
  if (current === null) return block;
  const si = current.indexOf(GI_START);
  const ei = current.indexOf(GI_END);
  if (si === -1 || ei === -1) return `${current}\n${block}`;
  return current.slice(0, si) + block + current.slice(ei + GI_END.length);
}

export async function runInit(repoRoot: string): Promise<void> {
  const aiDir = join(repoRoot, '.ai');

  try {
    await mkdir(aiDir, { recursive: false });
  } catch {
    const ok = await confirm({ message: '.ai/ already exists. Re-initialize?' });
    if (!ok) return;
  }

  const agents = await checkbox<AgentId>({
    message: 'Which agents to enable?',
    choices: [
      { name: 'Claude Code', value: 'claude', checked: true },
      { name: 'GitHub Copilot', value: 'copilot', checked: true },
      { name: 'Cursor', value: 'cursor', checked: true },
      { name: 'AGENTS.md', value: 'agents-md', checked: true },
    ],
  });

  await mkdir(join(aiDir, 'rules'), { recursive: true });
  await mkdir(join(aiDir, '.backups'), { recursive: true });

  const now = new Date().toISOString();
  await initRegistry(repoRoot, agents);
  await saveLock({ version: '0.1.2', lastSyncAt: now, generatedFiles: [] }, repoRoot);
  await saveLocalState({}, repoRoot);

  const giPath = join(repoRoot, '.gitignore');
  let giCurrent: string | null = null;
  try { giCurrent = await readFile(giPath, 'utf8'); } catch { /* no .gitignore yet */ }
  await writeFile(giPath, patchGitignore(giCurrent), 'utf8');

  console.log('\n✓ RepoTune initialized');
  console.log(`  Agents: ${agents.join(', ')}`);
  console.log("  Run 'repotune rule add' to add your first rule.");
}
