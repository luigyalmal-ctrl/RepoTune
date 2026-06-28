import { spawnSync } from "node:child_process";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addRule, loadLock, loadRegistry } from "@repotune/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeRule, setupRepo } from "./helpers";

const CLI = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../packages/cli/dist/index.js",
);

function runCli(
	args: string[],
	cwd: string,
): { status: number | null; stdout: string; stderr: string } {
	const r = spawnSync(process.execPath, [CLI, ...args], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, NO_COLOR: "1" },
	});
	return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "rt-cli-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("CLI integration", () => {
	it("--help lists all main commands", () => {
		const { status, stdout } = runCli(["--help"], dir);
		expect(status).toBe(0);
		expect(stdout).toContain("init");
		expect(stdout).toContain("rule");
		expect(stdout).toContain("sync");
		expect(stdout).toContain("doctor");
		expect(stdout).toContain("rollback");
	});

	it("doctor after clean sync exits 0", async () => {
		await setupRepo(dir);
		await addRule(makeRule("use-pnpm"), dir);
		expect(runCli(["sync", "--yes"], dir).status).toBe(0);
		expect(runCli(["doctor"], dir).status).toBe(0);
	});

	it("doctor after deleting generated file exits 4", async () => {
		await setupRepo(dir, ["agents-md"]);
		await addRule(makeRule("use-pnpm"), dir);
		expect(runCli(["sync", "--yes", "--agent", "agents-md"], dir).status).toBe(
			0,
		);
		await unlink(join(dir, "AGENTS.md"));
		const { status, stdout } = runCli(["doctor"], dir);
		expect(status).toBe(4);
		expect(stdout).toContain("AGENTS.md");
		expect(stdout).toMatch(/missing/i);
	});

	it("doctor manual content outside managed block exits 0", async () => {
		await setupRepo(dir, ["claude"]);
		await writeFile(join(dir, "CLAUDE.md"), "# Manual header\n", "utf8");
		await addRule(makeRule("use-pnpm"), dir);
		expect(runCli(["sync", "--yes", "--agent", "claude"], dir).status).toBe(0);

		const current = await readFile(join(dir, "CLAUDE.md"), "utf8");
		await writeFile(
			join(dir, "CLAUDE.md"),
			`${current}\n\n## Extra manual section\n`,
			"utf8",
		);

		expect(runCli(["doctor"], dir).status).toBe(0);
	});

	it("doctor modified managed block exits 4", async () => {
		await setupRepo(dir, ["claude"]);
		await addRule(makeRule("use-pnpm"), dir);
		expect(runCli(["sync", "--yes", "--agent", "claude"], dir).status).toBe(0);

		let content = await readFile(join(dir, "CLAUDE.md"), "utf8");
		content = content.replace("use-pnpm", "TAMPERED");
		await writeFile(join(dir, "CLAUDE.md"), content, "utf8");

		expect(runCli(["doctor"], dir).status).toBe(4);
	});

	it("sync --yes with conflicting rules exits 3", async () => {
		await setupRepo(dir, ["claude"]);
		const now = new Date().toISOString();
		await addRule(
			{
				id: "r1",
				content: "Use pnpm.",
				scope: "global",
				createdAt: now,
				updatedAt: now,
			},
			dir,
		);
		await addRule(
			{
				id: "r2",
				content: "Use npm.",
				scope: "global",
				createdAt: now,
				updatedAt: now,
			},
			dir,
		);
		const { status, stderr } = runCli(["sync", "--yes"], dir);
		expect(status).toBe(3);
		expect(stderr).toMatch(/conflict/i);
	});

	it("sync --dry-run writes zero files and does not update lock", async () => {
		await setupRepo(dir, ["claude"]);
		await addRule(makeRule("use-pnpm"), dir);
		const lockBefore = await loadLock(dir);
		const backupsBefore = await readdir(join(dir, ".ai", ".backups"));

		const { status } = runCli(["sync", "--dry-run"], dir);
		expect(status).toBe(0);
		await expect(access(join(dir, "CLAUDE.md"))).rejects.toThrow();

		const backupsAfter = await readdir(join(dir, ".ai", ".backups"));
		expect(backupsAfter).toEqual(backupsBefore);

		const lockAfter = await loadLock(dir);
		expect(lockAfter?.lastSyncAt).toBe(lockBefore?.lastSyncAt);
		expect(lockAfter?.generatedFiles).toEqual(lockBefore?.generatedFiles);
	});

	it("sync --yes writes expected files", async () => {
		await setupRepo(dir);
		await addRule(makeRule("use-pnpm"), dir);
		expect(runCli(["sync", "--yes"], dir).status).toBe(0);

		await expect(readFile(join(dir, "CLAUDE.md"), "utf8")).resolves.toContain(
			"repotune:start claude",
		);
		await expect(readFile(join(dir, "AGENTS.md"), "utf8")).resolves.toContain(
			"repotune:start agents-md",
		);
		await expect(
			readFile(join(dir, ".github/copilot-instructions.md"), "utf8"),
		).resolves.toContain("repotune:start copilot");

		const lock = await loadLock(dir);
		const claude = lock?.generatedFiles.find((f) => f.path === "CLAUDE.md");
		expect(claude?.checksumMode).toBe("managed-block");
	});

	it("global managed-block first sync does not duplicate block on second sync", async () => {
		await setupRepo(dir, ["agents-md"]);
		await addRule(makeRule("use-pnpm"), dir);
		expect(runCli(["sync", "--yes", "--agent", "agents-md"], dir).status).toBe(
			0,
		);
		expect(runCli(["sync", "--yes", "--agent", "agents-md"], dir).status).toBe(
			0,
		);

		const content = await readFile(join(dir, "AGENTS.md"), "utf8");
		expect(content.split("<!-- repotune:start agents-md -->").length - 1).toBe(
			1,
		);
		expect(content.split("<!-- repotune:end agents-md -->").length - 1).toBe(1);
	});

	it("rollback --yes restores modified files and deletes created files", async () => {
		await setupRepo(dir, ["claude"]);
		const original = "# Original manual content\n";
		await writeFile(join(dir, "CLAUDE.md"), original, "utf8");
		await addRule(makeRule("use-pnpm"), dir);
		expect(runCli(["sync", "--yes", "--agent", "claude"], dir).status).toBe(0);

		const synced = await readFile(join(dir, "CLAUDE.md"), "utf8");
		expect(synced).not.toBe(original);

		expect(runCli(["rollback", "--yes"], dir).status).toBe(0);
		expect(await readFile(join(dir, "CLAUDE.md"), "utf8")).toBe(original);
	});

	it("rule list prints existing rules", async () => {
		await setupRepo(dir);
		await addRule(makeRule("use-pnpm"), dir);
		const { status, stdout } = runCli(["rule", "list"], dir);
		expect(status).toBe(0);
		expect(stdout).toContain("use-pnpm");
		expect(stdout).toContain("global");
	});

	it("sync --agent invalid fails clearly", async () => {
		await setupRepo(dir);
		await addRule(makeRule("use-pnpm"), dir);
		const { status, stderr } = runCli(
			["sync", "--yes", "--agent", "invalid"],
			dir,
		);
		expect(status).toBe(2);
		expect(stderr).toMatch(/unknown agent/i);
	});

	it("sync skips unmanaged existing create files with warning", async () => {
		await setupRepo(dir, ["cursor"]);
		await mkdir(join(dir, ".cursor/rules"), { recursive: true });
		await writeFile(
			join(dir, ".cursor/rules/use-pnpm.mdc"),
			"manual cursor rule",
			"utf8",
		);
		await addRule(makeRule("use-pnpm"), dir);

		const { status, stdout } = runCli(
			["sync", "--yes", "--agent", "cursor"],
			dir,
		);
		expect(status).toBe(0);
		expect(stdout).toContain("FILE_EXISTS_NOT_IN_LOCK");
		expect(
			await readFile(join(dir, ".cursor/rules/use-pnpm.mdc"), "utf8"),
		).toBe("manual cursor rule");

		const lock = await loadLock(dir);
		expect(
			lock?.generatedFiles.some((f) => f.path === ".cursor/rules/use-pnpm.mdc"),
		).toBe(false);
	});
});
