import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractBlockContent, loadLock } from "@repotune/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doSync, makeRule, setupRepo } from "./helpers";

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "rt-doctor-int-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

function sha256(s: string): string {
	return createHash("sha256").update(s, "utf8").digest("hex");
}

// I-11: doctor after clean sync → all agents healthy (checksums match)
describe("I-11: healthy state after sync", () => {
	it("lock checksums match file content after sync", async () => {
		await setupRepo(dir);
		const rules = [makeRule("use-pnpm")];
		await doSync(dir, rules);

		const lock = await loadLock(dir);
		if (!lock) throw new Error("expected lock");

		for (const entry of lock.generatedFiles) {
			const content = await readFile(join(dir, entry.path), "utf8");
			if (entry.checksumMode === "full-file") {
				expect(sha256(content)).toBe(entry.checksum);
			} else {
				const inner = extractBlockContent(content, entry.agentId);
				if (inner === null) throw new Error("expected managed block");
				expect(sha256(inner)).toBe(entry.checksum);
			}
		}
	});
});

// I-12: doctor after deleting generated file → checksum cannot be computed (missing)
describe("I-12: missing file detected", () => {
	it("file not accessible after deletion", async () => {
		await setupRepo(dir, ["agents-md"]);
		const rules = [makeRule("use-pnpm")];
		await doSync(dir, rules, ["agents-md"]);

		// Verify file was created
		await expect(
			readFile(join(dir, "AGENTS.md"), "utf8"),
		).resolves.toBeTruthy();

		// Delete the file
		await unlink(join(dir, "AGENTS.md"));

		// Verify it's gone — doctor would flag this as missing
		await expect(readFile(join(dir, "AGENTS.md"), "utf8")).rejects.toThrow();

		// Lock still has the entry
		const lock = await loadLock(dir);
		const entry = lock?.generatedFiles.find((f) => f.path === "AGENTS.md");
		expect(entry).toBeDefined();
	});
});

// I-13: doctor with manual content outside block → NOT dirty (managed-block checksum)
describe("I-13: manual content outside block does not trigger dirty", () => {
	it("sha256 of block content unchanged after modifying content outside block", async () => {
		await setupRepo(dir, ["claude"]);
		// Pre-create CLAUDE.md so the adapter chooses managed-block strategy (not create)
		await writeFile(
			join(dir, "CLAUDE.md"),
			"# Existing Instructions\n\nManual content here.\n",
			"utf8",
		);
		const rules = [makeRule("use-pnpm")];
		await doSync(dir, rules, ["claude"]);

		const lock = await loadLock(dir);
		const claudeEntry = lock?.generatedFiles.find(
			(f) => f.agentId === "claude",
		);
		expect(claudeEntry?.checksumMode).toBe("managed-block");

		// Modify content outside the managed block
		const current = await readFile(join(dir, "CLAUDE.md"), "utf8");
		await writeFile(
			join(dir, "CLAUDE.md"),
			`${current}\n\n## Manual Section Added\n\nThis is outside the block.`,
			"utf8",
		);

		// Re-read and extract block
		const modified = await readFile(join(dir, "CLAUDE.md"), "utf8");
		const inner = extractBlockContent(modified, "claude");
		if (inner === null) throw new Error("expected managed block");
		if (!claudeEntry) throw new Error("expected claude lock entry");

		// Checksum of inner block content should still match lock
		expect(sha256(inner)).toBe(claudeEntry.checksum);
	});
});

describe("Codex doctor behavior", () => {
	it("tracks the codex managed block checksum", async () => {
		await setupRepo(dir, ["codex"]);
		await writeFile(
			join(dir, "AGENTS.md"),
			"# Existing instructions\n",
			"utf8",
		);

		const rules = [makeRule("use-pnpm", { content: "Use pnpm, never npm." })];
		await doSync(dir, rules, ["codex"]);

		const lock = await loadLock(dir);
		const codexEntry = lock?.generatedFiles.find(
			(file) => file.agentId === "codex",
		);
		expect(codexEntry?.checksumMode).toBe("managed-block");

		const content = await readFile(join(dir, "AGENTS.md"), "utf8");
		const inner = extractBlockContent(content, "codex");
		if (!inner || !codexEntry) throw new Error("expected codex managed block");
		expect(sha256(inner)).toBe(codexEntry.checksum);
	});
});

describe("Antigravity doctor behavior", () => {
	it("tracks the antigravity managed block checksum", async () => {
		await setupRepo(dir, ["antigravity"]);
		await mkdir(join(dir, ".agents"), { recursive: true });
		await writeFile(
			join(dir, ".agents/AGENTS.md"),
			"# Existing instructions\n",
			"utf8",
		);

		const rules = [makeRule("use-pnpm", { content: "Use pnpm, never npm." })];
		await doSync(dir, rules, ["antigravity"]);

		const lock = await loadLock(dir);
		const antigravityEntry = lock?.generatedFiles.find(
			(file) => file.agentId === "antigravity",
		);
		expect(antigravityEntry?.checksumMode).toBe("managed-block");

		const content = await readFile(join(dir, ".agents/AGENTS.md"), "utf8");
		const inner = extractBlockContent(content, "antigravity");
		if (!inner || !antigravityEntry)
			throw new Error("expected antigravity managed block");
		expect(sha256(inner)).toBe(antigravityEntry.checksum);
	});
});
