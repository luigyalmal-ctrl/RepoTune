import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LockFileSchema } from "@repotune/schemas";
import type { LockFile } from "@repotune/schemas";

const LOCK = ".ai/lock.json";

export async function loadLock(repoRoot: string): Promise<LockFile | null> {
	try {
		return LockFileSchema.parse(
			JSON.parse(await readFile(join(repoRoot, LOCK), "utf8")),
		);
	} catch {
		return null;
	}
}

export async function saveLock(
	lock: LockFile,
	repoRoot: string,
): Promise<void> {
	await mkdir(join(repoRoot, ".ai"), { recursive: true });
	await writeFile(join(repoRoot, LOCK), JSON.stringify(lock, null, 2));
}
