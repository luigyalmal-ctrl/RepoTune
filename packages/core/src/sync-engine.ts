import { createHash } from "node:crypto";
import { join } from "node:path";
import type {
	AgentAdapter,
	AgentId,
	DiffResult,
	GeneratedFile,
	LockGeneratedFile,
	Rule,
	SyncPreview,
	Warning,
} from "@repotune/schemas";
import { diffLines } from "diff";
import { createBackup } from "./backup-manager";
import { detectConflicts } from "./conflict-detector";
import { computeDiff } from "./diff-engine";
import {
	getUnsafeWriteWarning,
	readFileSafe,
	skippedPathsFromWarnings,
	writeGeneratedFile,
} from "./file-writer";
import { saveLocalState } from "./local-state";
import { loadLock, saveLock } from "./lock";
import { loadRegistry } from "./registry";

export interface SyncOptions {
	agents: AgentId[];
	repoRoot: string;
}

export interface SyncResult {
	applied: boolean;
	backupPath: string;
	generatedFiles: LockGeneratedFile[];
	warnings: Warning[];
}

function sha256(s: string): string {
	return createHash("sha256").update(s, "utf8").digest("hex");
}

function diffsEqual(a: DiffResult, b: DiffResult): boolean {
	if (a.files.length !== b.files.length) return false;
	const sort = (fs: DiffResult["files"]) =>
		[...fs].sort((x, y) => x.path.localeCompare(y.path));
	const af = sort(a.files);
	const bf = sort(b.files);
	return af.every(
		(f, i) =>
			f.path === bf[i].path &&
			f.before === bf[i].before &&
			f.after === bf[i].after &&
			f.hasChanges === bf[i].hasChanges,
	);
}

async function detectUnsafeWrites(
	files: GeneratedFile[],
	repoRoot: string,
	lockFile: Awaited<ReturnType<typeof loadLock>>,
): Promise<{ warnings: Warning[]; skippedPaths: Set<string> }> {
	const warnings: Warning[] = [];
	const skippedPaths = new Set<string>();

	for (const file of files) {
		const current = await readFileSafe(join(repoRoot, file.outputPath));
		const warning = getUnsafeWriteWarning(file, lockFile, current);
		if (warning) {
			warnings.push(warning);
			skippedPaths.add(file.outputPath);
		}
	}

	return { warnings, skippedPaths };
}

function adjustDiffForSkipped(
	diff: DiffResult,
	skippedPaths: Set<string>,
): DiffResult {
	if (skippedPaths.size === 0) return diff;

	const files = diff.files.map((f) => {
		if (!skippedPaths.has(f.path)) return f;
		return { ...f, hasChanges: false, after: f.before ?? f.after };
	});

	let totalAdded = 0;
	let totalRemoved = 0;
	let totalUnchanged = 0;
	for (const f of files) {
		if (!f.hasChanges) {
			totalUnchanged++;
			continue;
		}
		const changes = diffLines(f.before ?? "", f.after);
		totalAdded += changes
			.filter((c) => c.added)
			.reduce((s, c) => s + (c.count ?? 0), 0);
		totalRemoved += changes
			.filter((c) => c.removed)
			.reduce((s, c) => s + (c.count ?? 0), 0);
	}

	return { files, totalAdded, totalRemoved, totalUnchanged };
}

function mergeLockEntries(
	previous: LockGeneratedFile[],
	lockEntries: LockGeneratedFile[],
	syncedAgents: AgentId[],
): LockGeneratedFile[] {
	const preserved = previous.filter(
		(entry) => !syncedAgents.includes(entry.agentId),
	);
	return [...preserved, ...lockEntries].sort((a, b) => {
		const d = a.agentId.localeCompare(b.agentId);
		return d !== 0 ? d : a.path.localeCompare(b.path);
	});
}

export function createSyncEngine(adapters: Map<AgentId, AgentAdapter>) {
	async function planSync(
		rules: Rule[],
		opts: SyncOptions,
	): Promise<SyncPreview> {
		const allFiles: GeneratedFile[] = [];
		const allWarnings: Warning[] = [];

		for (const id of opts.agents) {
			const adapter = adapters.get(id);
			if (!adapter) continue;
			const r = await adapter.plan(rules, opts.repoRoot);
			allFiles.push(...r.generatedFiles);
			allWarnings.push(...r.warnings);
		}

		const lockFile = await loadLock(opts.repoRoot);
		const { warnings: unsafeWarnings, skippedPaths } = await detectUnsafeWrites(
			allFiles,
			opts.repoRoot,
			lockFile,
		);
		allWarnings.push(...unsafeWarnings);

		const rawDiff = await computeDiff(allFiles, opts.repoRoot);
		const diff = adjustDiffForSkipped(rawDiff, skippedPaths);

		return {
			plan: {
				agentIds: opts.agents,
				generatedFiles: allFiles,
				conflicts: detectConflicts(rules),
				warnings: allWarnings,
			},
			diff,
		};
	}

	async function applySync(
		preview: SyncPreview,
		opts: SyncOptions,
	): Promise<SyncResult> {
		const empty: SyncResult = {
			applied: false,
			backupPath: "",
			generatedFiles: [],
			warnings: [],
		};

		const { rules } = await loadRegistry(opts.repoRoot);
		const fresh = await planSync(rules, opts);

		if (!diffsEqual(fresh.diff, preview.diff)) return empty;
		if (fresh.plan.conflicts.length > 0) return empty;

		const { generatedFiles } = preview.plan;
		const lockFile = await loadLock(opts.repoRoot);
		const skippedPaths = skippedPathsFromWarnings(fresh.plan.warnings);

		const changedPaths = new Set(
			preview.diff.files
				.filter((f) => f.hasChanges && !skippedPaths.has(f.path))
				.map((f) => f.path),
		);
		const filesToBackup = generatedFiles.filter((f) =>
			changedPaths.has(f.outputPath),
		);
		const backupPath =
			changedPaths.size > 0
				? await createBackup(filesToBackup, opts.repoRoot)
				: "";

		const writeWarnings: Warning[] = [];
		for (const file of generatedFiles) {
			if (!changedPaths.has(file.outputPath)) continue;
			writeWarnings.push(
				...(await writeGeneratedFile(file, opts.repoRoot, lockFile)),
			);
		}

		const allWarnings = [...fresh.plan.warnings, ...writeWarnings];
		const finalSkipped = skippedPathsFromWarnings(allWarnings);

		const now = new Date().toISOString();
		const lockEntries: LockGeneratedFile[] = [];

		for (const file of generatedFiles) {
			if (finalSkipped.has(file.outputPath)) continue;

			const mode =
				file.strategy === "managed-block" ? "managed-block" : "full-file";
			const diffFile = fresh.diff.files.find((f) => f.path === file.outputPath);
			const checksumSrc =
				mode === "managed-block"
					? file.content
					: (diffFile?.after ?? file.content);

			lockEntries.push({
				path: file.outputPath,
				agentId: file.agentId,
				strategy: file.strategy,
				checksum: sha256(checksumSrc),
				checksumMode: mode,
				ruleIds: file.ruleIds,
				syncedAt: now,
			});
		}

		const previous = lockFile?.generatedFiles ?? [];
		const nextGeneratedFiles = mergeLockEntries(
			previous,
			lockEntries,
			opts.agents,
		);

		await saveLock(
			{ version: "0.2.0", lastSyncAt: now, generatedFiles: nextGeneratedFiles },
			opts.repoRoot,
		);
		if (backupPath) {
			await saveLocalState(
				{ lastBackupPath: backupPath, lastSyncAt: now },
				opts.repoRoot,
			);
		}

		return {
			applied: true,
			backupPath,
			generatedFiles: lockEntries,
			warnings: allWarnings,
		};
	}

	return { planSync, applySync };
}
