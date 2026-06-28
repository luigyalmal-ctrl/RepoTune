import { confirm } from "@inquirer/prompts";
import { agentsMdAdapter } from "@repotune/adapter-agents-md";
import { claudeAdapter } from "@repotune/adapter-claude";
import { copilotAdapter } from "@repotune/adapter-copilot";
import { cursorAdapter } from "@repotune/adapter-cursor";
import { createSyncEngine, loadRegistry } from "@repotune/core";
import {
	type AgentAdapter,
	type AgentId,
	AgentIdSchema,
} from "@repotune/schemas";
import { printDiff } from "../output/diff-printer";

const ALL_ADAPTERS = new Map<AgentId, AgentAdapter>([
	["claude", claudeAdapter],
	["copilot", copilotAdapter],
	["cursor", cursorAdapter],
	["agents-md", agentsMdAdapter],
]);

export interface SyncOptions {
	dryRun: boolean;
	diff: boolean;
	agents: AgentId[];
	yes: boolean;
}

export async function runSync(
	repoRoot: string,
	opts: SyncOptions,
): Promise<void> {
	const reg = await loadRegistry(repoRoot);
	const agents = opts.agents.length > 0 ? opts.agents : reg.agents;

	if (opts.agents.length > 0) {
		for (const id of opts.agents) {
			const parsed = AgentIdSchema.safeParse(id);
			if (!parsed.success) {
				console.error(
					`Error: unknown agent '${id}'. Valid agents: claude, copilot, cursor, agents-md`,
				);
				process.exit(2);
			}
			if (!reg.agents.includes(parsed.data)) {
				console.error(
					`Error: agent '${id}' is not enabled in registry. Enabled: ${reg.agents.join(", ")}`,
				);
				process.exit(2);
			}
		}
	}

	const engine = createSyncEngine(ALL_ADAPTERS);
	const preview = await engine.planSync(reg.rules, { agents, repoRoot });

	if (preview.plan.conflicts.length > 0) {
		console.error("Conflicts detected — sync blocked:");
		for (const c of preview.plan.conflicts) {
			console.error(
				`  [${c.severity}] ${c.ruleId} ↔ ${c.conflictingRuleId}: ${c.description}`,
			);
		}
		process.exit(3);
	}

	const changed = preview.diff.files.filter((f) => f.hasChanges);

	if (opts.dryRun) {
		console.log(
			`Dry run: ${changed.length} file(s) would change, ${preview.diff.totalUnchanged} unchanged.\n`,
		);
		for (const f of changed) {
			const tag = f.before === null ? "+" : "~";
			console.log(`  ${tag} ${f.path}`);
		}
		if (preview.plan.warnings.length > 0) {
			console.log("\nWarnings:");
			for (const w of preview.plan.warnings)
				console.log(`  ${w.code}: ${w.message}`);
		}
		process.exit(0);
	}

	if (opts.diff && changed.length > 0) printDiff(preview.diff);

	if (changed.length === 0) {
		console.log("Nothing to sync — all files up to date.");
		if (preview.plan.warnings.length > 0) {
			console.log("\nWarnings:");
			for (const w of preview.plan.warnings)
				console.log(`  ${w.code}: ${w.message}`);
		}
		return;
	}

	if (!opts.yes) {
		const ok = await confirm({
			message: `Apply ${changed.length} change(s)?`,
			default: false,
		});
		if (!ok) {
			console.log("Aborted.");
			return;
		}
	}

	const result = await engine.applySync(preview, { agents, repoRoot });

	if (!result.applied) {
		console.error(
			"Sync aborted — filesystem changed between plan and apply. Re-run repotune sync.",
		);
		process.exit(1);
	}

	const totalRules = new Set(result.generatedFiles.flatMap((f) => f.ruleIds))
		.size;
	console.log(
		`\nSynced ${totalRules} rule(s) → ${result.generatedFiles.length} file(s)\n`,
	);

	for (const f of preview.diff.files) {
		if (!f.hasChanges) continue;
		const gf = preview.plan.generatedFiles.find((x) => x.outputPath === f.path);
		const tag = f.before === null ? "+" : "✓";
		const note =
			gf?.strategy === "managed-block"
				? "(managed block updated)"
				: f.before === null
					? "(created)"
					: "(updated)";
		console.log(`  ${tag} ${f.path.padEnd(42)} ${note}`);
	}

	const warnings = [...preview.plan.warnings, ...result.warnings];
	const seen = new Set<string>();
	const uniqueWarnings = warnings.filter((w) => {
		const key = `${w.code}:${w.path ?? w.message}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	if (uniqueWarnings.length > 0) {
		console.log("\nWarnings:");
		for (const w of uniqueWarnings) console.log(`  ${w.code}: ${w.message}`);
	}

	if (result.backupPath) {
		const bp = result.backupPath.startsWith(repoRoot)
			? result.backupPath.slice(repoRoot.length).replace(/^[/\\]/, "")
			: result.backupPath;
		console.log(`\nBackup: ${bp}`);
	}
}
