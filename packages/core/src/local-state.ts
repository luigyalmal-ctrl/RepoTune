import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LocalStateSchema } from "@repotune/schemas";
import type { LocalState } from "@repotune/schemas";

const STATE = ".ai/state.local.json";

export async function loadLocalState(repoRoot: string): Promise<LocalState> {
	try {
		return LocalStateSchema.parse(
			JSON.parse(await readFile(join(repoRoot, STATE), "utf8")),
		);
	} catch {
		return {};
	}
}

export async function saveLocalState(
	state: LocalState,
	repoRoot: string,
): Promise<void> {
	await mkdir(join(repoRoot, ".ai"), { recursive: true });
	await writeFile(join(repoRoot, STATE), JSON.stringify(state, null, 2));
}
