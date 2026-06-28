import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { agentsMdAdapter } from "@repotune/adapter-agents-md";
import { antigravityAdapter } from "@repotune/adapter-antigravity";
import { claudeAdapter } from "@repotune/adapter-claude";
import { codexAdapter } from "@repotune/adapter-codex";
import { copilotAdapter } from "@repotune/adapter-copilot";
import { cursorAdapter } from "@repotune/adapter-cursor";
import { devinAdapter } from "@repotune/adapter-devin";
import {
	addRule,
	createSyncEngine,
	initRegistry,
	loadRegistry,
	saveLocalState,
	saveLock,
} from "@repotune/core";
import type {
	AgentAdapter,
	AgentId,
	Rule,
	SyncPreview,
} from "@repotune/schemas";

export const ALL_ADAPTERS = new Map<AgentId, AgentAdapter>([
	["claude", claudeAdapter],
	["copilot", copilotAdapter],
	["cursor", cursorAdapter],
	["codex", codexAdapter],
	["agents-md", agentsMdAdapter],
	["devin", devinAdapter],
	["antigravity", antigravityAdapter],
]);

const GI_START = "<!-- repotune:start gitignore -->";
const GI_END = "<!-- repotune:end gitignore -->";
const GI_CONTENT =
	"# RepoTune local state\n.ai/.backups/\n.ai/state.local.json";

export function patchGitignore(current: string | null): string {
	const block = `${GI_START}\n${GI_CONTENT}\n${GI_END}`;
	if (current === null) return block;
	const si = current.indexOf(GI_START);
	const ei = current.indexOf(GI_END);
	if (si === -1 || ei === -1) return `${current}\n${block}`;
	return current.slice(0, si) + block + current.slice(ei + GI_END.length);
}

export async function setupRepo(
	dir: string,
	agents: AgentId[] = ["claude", "copilot", "cursor", "agents-md"],
): Promise<void> {
	await mkdir(join(dir, ".ai", "rules"), { recursive: true });
	await mkdir(join(dir, ".ai", ".backups"), { recursive: true });
	const now = new Date().toISOString();
	await initRegistry(dir, agents);
	await saveLock(
		{ version: "0.2.0", lastSyncAt: now, generatedFiles: [] },
		dir,
	);
	await saveLocalState({}, dir);
	await writeFile(join(dir, ".gitignore"), patchGitignore(null), "utf8");
}

export function makeRule(id: string, overrides: Partial<Rule> = {}): Rule {
	const now = new Date().toISOString();
	return {
		id,
		content: `# ${id}\nContent for ${id}.`,
		scope: "global",
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

export async function doSync(
	dir: string,
	rules: Rule[],
	agents: AgentId[] = ["claude", "copilot", "cursor", "agents-md"],
): Promise<{ preview: SyncPreview; applied: boolean; backupPath: string }> {
	// Write rules to registry first so applySync's re-validation reads the same rules
	const reg = await loadRegistry(dir);
	const existingIds = new Set(reg.rules.map((r) => r.id));
	for (const rule of rules) {
		if (!existingIds.has(rule.id)) await addRule(rule, dir);
	}
	const engine = createSyncEngine(ALL_ADAPTERS);
	const preview = await engine.planSync(rules, { agents, repoRoot: dir });
	const result = await engine.applySync(preview, { agents, repoRoot: dir });
	return { preview, applied: result.applied, backupPath: result.backupPath };
}
