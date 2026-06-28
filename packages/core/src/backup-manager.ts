import {
	access,
	copyFile,
	mkdir,
	readFile,
	readdir,
	rmdir,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { BackupManifestSchema } from "@repotune/schemas";
import type { BackupManifest, GeneratedFile } from "@repotune/schemas";

async function exists(p: string): Promise<boolean> {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

async function rmEmptyParents(dir: string, root: string): Promise<void> {
	if (!dir.startsWith(root) || dir === root) return;
	try {
		if ((await readdir(dir)).length === 0) {
			await rmdir(dir);
			await rmEmptyParents(dirname(dir), root);
		}
	} catch {
		/* ignore */
	}
}

export async function createBackup(
	files: GeneratedFile[],
	repoRoot: string,
): Promise<string> {
	// Include milliseconds so rapid successive syncs get unique directories
	const ts = new Date().toISOString().slice(0, 23).replace(/[:.]/g, "-");
	const base = join(repoRoot, ".ai", ".backups");
	await mkdir(base, { recursive: true });
	let backupDir = join(base, ts);
	let suffix = 0;
	while (true) {
		try {
			await mkdir(backupDir, { recursive: false });
			break;
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "EEXIST") throw err;
			suffix += 1;
			backupDir = join(base, `${ts}-${suffix}`);
		}
	}

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

	const manifest: BackupManifest = {
		createdAt: new Date().toISOString(),
		createdFiles,
		modifiedFiles,
	};
	await writeFile(
		join(backupDir, "manifest.json"),
		JSON.stringify(manifest, null, 2),
	);
	return backupDir;
}

export async function restoreBackup(
	backupPath: string,
	repoRoot: string,
): Promise<void> {
	const manifest = BackupManifestSchema.parse(
		JSON.parse(await readFile(join(backupPath, "manifest.json"), "utf8")),
	);
	for (const rel of manifest.modifiedFiles) {
		const dest = join(repoRoot, rel);
		await mkdir(dirname(dest), { recursive: true });
		await copyFile(join(backupPath, rel), dest);
	}
	for (const rel of manifest.createdFiles) {
		const p = join(repoRoot, rel);
		try {
			await unlink(p);
			await rmEmptyParents(dirname(p), repoRoot);
		} catch {
			/* already gone */
		}
	}
}

export async function listBackups(repoRoot: string): Promise<string[]> {
	const dir = join(repoRoot, ".ai", ".backups");
	try {
		return (await readdir(dir))
			.map((e) => join(dir, e))
			.sort((a, b) => b.localeCompare(a));
	} catch {
		return [];
	}
}
