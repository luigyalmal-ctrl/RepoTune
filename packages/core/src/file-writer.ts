import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GeneratedFile, LockFile, Warning } from "@repotune/schemas";
import { render } from "./managed-block-renderer";

const UNSAFE_SKIP_CODES = new Set([
	"FILE_EXISTS_NOT_IN_LOCK",
	"FILE_NOT_IN_LOCK",
]);

export async function readFileSafe(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, "utf8");
	} catch {
		return null;
	}
}

export function getUnsafeWriteWarning(
	file: GeneratedFile,
	lockFile: LockFile | null,
	current: string | null,
): Warning | null {
	if (file.strategy === "skip") return null;

	const inLock =
		lockFile?.generatedFiles.some((f) => f.path === file.outputPath) ?? false;

	if (file.strategy === "create" && current !== null && !inLock) {
		return {
			code: "FILE_EXISTS_NOT_IN_LOCK",
			message: `${file.outputPath} exists and is untracked — skipped`,
			agentId: file.agentId,
			path: file.outputPath,
		};
	}

	if (file.strategy === "overwrite" && !inLock) {
		return {
			code: "FILE_NOT_IN_LOCK",
			message: `${file.outputPath} is not tracked in lock.json — skipped`,
			agentId: file.agentId,
			path: file.outputPath,
		};
	}

	return null;
}

export function skippedPathsFromWarnings(warnings: Warning[]): Set<string> {
	const paths = new Set<string>();
	for (const w of warnings) {
		if (UNSAFE_SKIP_CODES.has(w.code) && w.path) paths.add(w.path);
	}
	return paths;
}

export async function writeGeneratedFile(
	file: GeneratedFile,
	repoRoot: string,
	lockFile: LockFile | null,
): Promise<Warning[]> {
	if (file.strategy === "skip") return [];

	const absPath = join(repoRoot, file.outputPath);
	const current = await readFileSafe(absPath);
	const unsafe = getUnsafeWriteWarning(file, lockFile, current);
	if (unsafe) return [unsafe];

	const rendered = render(file, current);
	if (rendered === current) return []; // byte-identical — skip write

	await mkdir(dirname(absPath), { recursive: true });
	await writeFile(absPath, rendered, "utf8");
	return [];
}
