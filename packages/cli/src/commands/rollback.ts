import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { confirm, select } from "@inquirer/prompts";
import { listBackups, loadLocalState, restoreBackup } from "@repotune/core";
import { BackupManifestSchema } from "@repotune/schemas";

export async function runRollback(
	repoRoot: string,
	backupOpt: string | undefined,
	yes: boolean,
): Promise<void> {
	let backupPath = backupOpt;

	if (!backupPath) {
		const state = await loadLocalState(repoRoot);
		backupPath = state.lastBackupPath;
	}

	if (!backupPath) {
		const backups = await listBackups(repoRoot);
		if (backups.length === 0) {
			console.error("No backups found. Nothing to roll back.");
			process.exit(1);
		}
		backupPath =
			backups.length === 1
				? backups[0]
				: await select({
						message: "Select backup to restore:",
						choices: backups
							.slice(0, 10)
							.map((b) => ({ name: basename(b), value: b })),
					});
	}

	const manifest = BackupManifestSchema.parse(
		JSON.parse(await readFile(join(backupPath, "manifest.json"), "utf8")),
	);

	if (manifest.modifiedFiles.length > 0) {
		console.log(`Will restore ${manifest.modifiedFiles.length} file(s):`);
		for (const f of manifest.modifiedFiles) console.log(`  ↩ ${f}`);
	}
	if (manifest.createdFiles.length > 0) {
		console.log(
			`Will delete ${manifest.createdFiles.length} file(s) (created by the sync being rolled back):`,
		);
		for (const f of manifest.createdFiles) console.log(`  ✕ ${f}`);
	}

	if (!yes) {
		const ok = await confirm({
			message: "Restore these files?",
			default: false,
		});
		if (!ok) {
			console.log("Aborted.");
			return;
		}
	}

	await restoreBackup(backupPath, repoRoot);
	console.log(
		`\nRollback complete. Restored ${manifest.modifiedFiles.length} file(s), deleted ${manifest.createdFiles.length} file(s).`,
	);
}
