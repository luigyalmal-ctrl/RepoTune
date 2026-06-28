import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { agentsMdAdapter } from "@repotune/adapter-agents-md";
import { claudeAdapter } from "@repotune/adapter-claude";
import { copilotAdapter } from "@repotune/adapter-copilot";
import { cursorAdapter } from "@repotune/adapter-cursor";
import {
	detectConflicts,
	extractBlockContent,
	loadLock,
	loadRegistry,
} from "@repotune/core";
import type {
	AgentAdapter,
	AgentId,
	LockGeneratedFile,
} from "@repotune/schemas";

const ALL_ADAPTERS = new Map<AgentId, AgentAdapter>([
	["claude", claudeAdapter],
	["copilot", copilotAdapter],
	["cursor", cursorAdapter],
	["agents-md", agentsMdAdapter],
]);

function sha256(s: string): string {
	return createHash("sha256").update(s, "utf8").digest("hex");
}

async function checkEntry(
	lf: LockGeneratedFile,
	repoRoot: string,
): Promise<"ok" | "missing" | "dirty"> {
	let content: string;
	try {
		content = await readFile(join(repoRoot, lf.path), "utf8");
	} catch {
		return "missing";
	}

	if (lf.checksumMode === "full-file") {
		return sha256(content) === lf.checksum ? "ok" : "dirty";
	}

	const inner = extractBlockContent(content, lf.agentId);
	if (inner === null) return "dirty";
	return sha256(inner) === lf.checksum ? "ok" : "dirty";
}

export async function runDoctor(repoRoot: string): Promise<void> {
	let reg: Awaited<ReturnType<typeof loadRegistry>>;
	try {
		reg = await loadRegistry(repoRoot);
	} catch {
		console.error(
			"Error: registry.json is missing or invalid. Run 'repotune init' first.",
		);
		process.exit(2);
	}

	const lockFile = await loadLock(repoRoot);
	if (!lockFile)
		console.warn(
			"Warning: lock.json missing. Run 'repotune sync' to generate it.\n",
		);

	console.log("RepoTune Doctor Report\n");
	console.log(`Agents: ${reg.agents.join(", ")}\n`);

	let hasDirty = false;
	const allMessages: string[] = [];

	for (const agentId of reg.agents) {
		const adapter = ALL_ADAPTERS.get(agentId);
		if (!adapter) continue;

		const validateWarnings = await adapter.validate({ repoRoot, lockFile });
		const lockEntries =
			lockFile?.generatedFiles.filter((f) => f.agentId === agentId) ?? [];
		const messages: string[] = [];
		let status = "✓";

		for (const entry of lockEntries) {
			const s = await checkEntry(entry, repoRoot);
			if (s === "missing") {
				status = "✗";
				hasDirty = true;
				messages.push(`${entry.path} missing (sync required)`);
			} else if (s === "dirty") {
				status = "✗";
				hasDirty = true;
				messages.push(`${entry.path} modified externally`);
			}
		}
		for (const w of validateWarnings) {
			if (status === "✓") status = "⚠";
			messages.push(w.message);
		}

		const summary =
			messages.length === 0
				? lockEntries.length > 0
					? "all files healthy"
					: "not synced yet"
				: messages[0];

		console.log(`${status} ${agentId.padEnd(12)} — ${summary}`);
		allMessages.push(...messages);
	}

	const conflicts = detectConflicts(reg.rules);
	console.log(`\nRules: ${reg.rules.length} total`);
	console.log(`Conflicts: ${conflicts.length}`);

	if (conflicts.length > 0) {
		console.log("\nConflicts:");
		for (const c of conflicts)
			console.log(
				`  [${c.severity}] ${c.ruleId} ↔ ${c.conflictingRuleId}: ${c.description}`,
			);
	}

	if (allMessages.length > 0) {
		console.log("\nWarnings:");
		for (const m of allMessages) console.log(`  ${m}`);
		console.log("  → run 'repotune sync' to fix");
	}

	if (hasDirty) process.exit(4);
}
