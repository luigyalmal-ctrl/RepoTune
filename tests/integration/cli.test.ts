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
import { RegistrySchema } from "@repotune/schemas";
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
	it("init --agents --yes creates .ai/ with valid registry and gitignore block", async () => {
		const { status, stdout } = runCli(
			["init", "--agents", "claude,copilot,cursor,codex,agents-md", "--yes"],
			dir,
		);
		expect(status).toBe(0);
		expect(stdout).toContain("RepoTune initialized");

		const reg = await loadRegistry(dir);
		expect(() => RegistrySchema.parse(reg)).not.toThrow();
		expect(reg.agents).toEqual([
			"claude",
			"copilot",
			"cursor",
			"codex",
			"agents-md",
		]);

		const gi = await readFile(join(dir, ".gitignore"), "utf8");
		expect(gi).toContain("<!-- repotune:start gitignore -->");
		expect(gi).toContain(".ai/.backups/");
	});

	it("init twice keeps gitignore block exactly once", async () => {
		expect(runCli(["init", "--agents", "claude", "--yes"], dir).status).toBe(0);
		expect(runCli(["init", "--agents", "claude", "--yes"], dir).status).toBe(0);

		const gi = await readFile(join(dir, ".gitignore"), "utf8");
		expect(gi.split("<!-- repotune:start gitignore -->").length - 1).toBe(1);
	});

	it("rule add --scope global adds rule to registry", async () => {
		await setupRepo(dir);
		const { status, stdout } = runCli(
			["rule", "add", "Use pnpm, never npm.", "--scope", "global"],
			dir,
		);
		expect(status).toBe(0);
		expect(stdout).toContain("Rule added:");

		const reg = await loadRegistry(dir);
		expect(reg.rules).toHaveLength(1);
		expect(reg.rules[0].scope).toBe("global");
		expect(reg.rules[0].content).toBe("Use pnpm, never npm.");
	});

	it("rule add --scope path --path adds path rule", async () => {
		await setupRepo(dir);
		expect(
			runCli(
				[
					"rule",
					"add",
					"Use strict TS",
					"--scope",
					"path",
					"--path",
					"src/**/*.ts",
				],
				dir,
			).status,
		).toBe(0);

		const reg = await loadRegistry(dir);
		expect(reg.rules).toHaveLength(1);
		expect(reg.rules[0].scope).toBe("path");
		expect(reg.rules[0].pathPattern).toBe("src/**/*.ts");
	});

	it("sync --agent preserves lock entries for other agents", async () => {
		await setupRepo(dir);
		await addRule(makeRule("use-pnpm"), dir);
		expect(runCli(["sync", "--yes"], dir).status).toBe(0);

		let lock = await loadLock(dir);
		expect(lock?.generatedFiles.some((f) => f.agentId === "copilot")).toBe(
			true,
		);
		expect(lock?.generatedFiles.some((f) => f.agentId === "cursor")).toBe(true);
		expect(lock?.generatedFiles.some((f) => f.agentId === "agents-md")).toBe(
			true,
		);

		expect(runCli(["sync", "--yes", "--agent", "claude"], dir).status).toBe(0);

		lock = await loadLock(dir);
		expect(lock?.generatedFiles.some((f) => f.agentId === "copilot")).toBe(
			true,
		);
		expect(lock?.generatedFiles.some((f) => f.agentId === "cursor")).toBe(true);
		expect(lock?.generatedFiles.some((f) => f.agentId === "agents-md")).toBe(
			true,
		);
		expect(lock?.generatedFiles.some((f) => f.agentId === "claude")).toBe(true);
	});

	it("--help lists all main commands", () => {
		const { status, stdout } = runCli(["--help"], dir);
		expect(status).toBe(0);
		expect(stdout).toContain("init");
		expect(stdout).toContain("rule");
		expect(stdout).toContain("sync");
		expect(stdout).toContain("doctor");
		expect(stdout).toContain("rollback");
	});

	it("init --help lists v0.2.0 agent ids", () => {
		const { status, stdout } = runCli(["init", "--help"], dir);
		expect(status).toBe(0);
		expect(stdout).toContain("antigravity");
		expect(stdout).toContain("codex");
		expect(stdout).toContain("devin");
	});

	it("init --agents codex --yes enables codex only", async () => {
		const { status } = runCli(["init", "--agents", "codex", "--yes"], dir);
		expect(status).toBe(0);

		const reg = await loadRegistry(dir);
		expect(reg.agents).toEqual(["codex"]);
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

	it("doctor after deleting codex-generated AGENTS.md exits 4", async () => {
		await setupRepo(dir, ["codex"]);
		await addRule(makeRule("use-pnpm"), dir);
		expect(runCli(["sync", "--yes", "--agent", "codex"], dir).status).toBe(0);
		await unlink(join(dir, "AGENTS.md"));

		const { status, stdout } = runCli(["doctor"], dir);
		expect(status).toBe(4);
		expect(stdout).toContain("codex");
		expect(stdout).toContain("AGENTS.md");
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

	it("sync --agent codex writes AGENTS.md with a codex managed block", async () => {
		await setupRepo(dir, ["codex"]);
		await addRule(
			makeRule("use-pnpm", { content: "Use pnpm, never npm." }),
			dir,
		);

		const { status } = runCli(["sync", "--yes", "--agent", "codex"], dir);
		expect(status).toBe(0);

		const content = await readFile(join(dir, "AGENTS.md"), "utf8");
		expect(content).toContain("<!-- repotune:start codex -->");
		expect(content).toContain("Use pnpm, never npm.");
	});

	it("sync --dry-run --agent codex writes zero files", async () => {
		await setupRepo(dir, ["codex"]);
		await addRule(
			makeRule("use-pnpm", { content: "Use pnpm, never npm." }),
			dir,
		);

		const { status, stdout } = runCli(
			["sync", "--dry-run", "--agent", "codex"],
			dir,
		);
		expect(status).toBe(0);
		expect(stdout).toContain("Dry run:");
		await expect(access(join(dir, "AGENTS.md"))).rejects.toThrow();
	});

	it("sync --dry-run --agent codex warns when agents-md is also enabled", async () => {
		await setupRepo(dir, ["codex", "agents-md"]);
		await addRule(
			makeRule("use-pnpm", { content: "Use pnpm, never npm." }),
			dir,
		);

		const { status, stdout } = runCli(
			["sync", "--dry-run", "--agent", "codex"],
			dir,
		);
		expect(status).toBe(0);
		expect(stdout).toContain("CODEX_AGENTS_MD_CONFLICT");
		await expect(access(join(dir, "AGENTS.md"))).rejects.toThrow();
	});

	it("sync --agent codex warns when agents-md is also enabled", async () => {
		await setupRepo(dir, ["codex", "agents-md"]);
		await addRule(
			makeRule("use-pnpm", { content: "Use pnpm, never npm." }),
			dir,
		);

		const { status, stdout } = runCli(
			["sync", "--yes", "--agent", "codex"],
			dir,
		);
		expect(status).toBe(0);
		expect(stdout).toContain("CODEX_AGENTS_MD_CONFLICT");
		await expect(access(join(dir, "AGENTS.md"))).rejects.toThrow();
	});

	it("sync with codex and agents-md writes one agents-md block and doctor passes", async () => {
		await setupRepo(dir, ["codex", "agents-md"]);
		await addRule(
			makeRule("use-pnpm", { content: "Use pnpm, never npm." }),
			dir,
		);

		const { status: syncStatus, stdout: syncStdout } = runCli(
			["sync", "--yes"],
			dir,
		);
		expect(syncStatus).toBe(0);
		expect(syncStdout).toContain("CODEX_AGENTS_MD_CONFLICT");

		const content = await readFile(join(dir, "AGENTS.md"), "utf8");
		expect(content).toContain("<!-- repotune:start agents-md -->");
		expect(content).not.toContain("<!-- repotune:start codex -->");
		expect(content.split("<!-- repotune:start agents-md -->").length - 1).toBe(
			1,
		);

		const lock = await loadLock(dir);
		expect(lock?.generatedFiles.some((f) => f.agentId === "codex")).toBe(false);
		expect(lock?.generatedFiles.some((f) => f.agentId === "agents-md")).toBe(
			true,
		);

		const { status: doctorStatus, stdout: doctorStdout } = runCli(
			["doctor"],
			dir,
		);
		expect(doctorStatus).toBe(0);
		expect(doctorStdout).toContain(
			"AGENTS.md owned by agents-md (Codex reads generated file)",
		);
	});

	it("init --agents devin --yes enables devin only", async () => {
		const { status } = runCli(["init", "--agents", "devin", "--yes"], dir);
		expect(status).toBe(0);

		const reg = await loadRegistry(dir);
		expect(reg.agents).toEqual(["devin"]);
	});

	it("sync --agent devin writes AGENTS.md with a devin managed block", async () => {
		await setupRepo(dir, ["devin"]);
		await addRule(
			makeRule("use-pnpm", { content: "Use pnpm, never npm." }),
			dir,
		);

		const { status } = runCli(["sync", "--yes", "--agent", "devin"], dir);
		expect(status).toBe(0);

		const content = await readFile(join(dir, "AGENTS.md"), "utf8");
		expect(content).toContain("<!-- repotune:start devin -->");
		expect(content).toContain("Use pnpm, never npm.");
	});

	it("sync --dry-run --agent devin writes zero files", async () => {
		await setupRepo(dir, ["devin"]);
		await addRule(
			makeRule("use-pnpm", { content: "Use pnpm, never npm." }),
			dir,
		);

		const { status, stdout } = runCli(
			["sync", "--dry-run", "--agent", "devin"],
			dir,
		);
		expect(status).toBe(0);
		expect(stdout).toContain("Dry run:");
		await expect(access(join(dir, "AGENTS.md"))).rejects.toThrow();
	});

	it("sync --agent devin warns when agents-md is also enabled", async () => {
		await setupRepo(dir, ["devin", "agents-md"]);
		await addRule(
			makeRule("use-pnpm", { content: "Use pnpm, never npm." }),
			dir,
		);

		const { status, stdout } = runCli(
			["sync", "--yes", "--agent", "devin"],
			dir,
		);
		expect(status).toBe(0);
		expect(stdout).toContain("DEVIN_AGENTS_MD_CONFLICT");
		await expect(access(join(dir, "AGENTS.md"))).rejects.toThrow();
	});

	it("sync with devin and agents-md writes one agents-md block and doctor passes", async () => {
		await setupRepo(dir, ["devin", "agents-md"]);
		await addRule(
			makeRule("use-pnpm", { content: "Use pnpm, never npm." }),
			dir,
		);

		const { status: syncStatus, stdout: syncStdout } = runCli(
			["sync", "--yes"],
			dir,
		);
		expect(syncStatus).toBe(0);
		expect(syncStdout).toContain("DEVIN_AGENTS_MD_CONFLICT");

		const content = await readFile(join(dir, "AGENTS.md"), "utf8");
		expect(content).toContain("<!-- repotune:start agents-md -->");
		expect(content).not.toContain("<!-- repotune:start devin -->");
		expect(content.split("<!-- repotune:start agents-md -->").length - 1).toBe(
			1,
		);

		const lock = await loadLock(dir);
		expect(lock?.generatedFiles.some((f) => f.agentId === "devin")).toBe(false);

		const { status: doctorStatus, stdout: doctorStdout } = runCli(
			["doctor"],
			dir,
		);
		expect(doctorStatus).toBe(0);
		expect(doctorStdout).toContain(
			"AGENTS.md owned by agents-md; Devin reads generated file",
		);
	});

	it("doctor after deleting devin-generated AGENTS.md exits 4", async () => {
		await setupRepo(dir, ["devin"]);
		await addRule(
			makeRule("use-pnpm", { content: "Use pnpm, never npm." }),
			dir,
		);
		expect(runCli(["sync", "--yes", "--agent", "devin"], dir).status).toBe(0);
		await unlink(join(dir, "AGENTS.md"));

		const { status, stdout } = runCli(["doctor"], dir);
		expect(status).toBe(4);
		expect(stdout).toContain("devin");
		expect(stdout).toContain("AGENTS.md");
	});

	it("copilot sync preserves manual content and deduplicates managed block", async () => {
		await setupRepo(dir, ["copilot"]);
		await mkdir(join(dir, ".github"), { recursive: true });
		const manualHeader = "# Manual Repo Instructions\n\nKeep this content.\n\n";
		const manualFooter = "\n\n## Footer note\nKeep this too.\n";
		await writeFile(
			join(dir, ".github", "copilot-instructions.md"),
			`${manualHeader}${manualFooter}`,
			"utf8",
		);

		const { status } = runCli(
			["rule", "add", "Use pnpm, never npm.", "--scope", "global"],
			dir,
		);
		expect(status).toBe(0);

		expect(runCli(["sync", "--yes", "--agent", "copilot"], dir).status).toBe(0);

		let content = await readFile(
			join(dir, ".github", "copilot-instructions.md"),
			"utf8",
		);
		expect(content).toContain(manualHeader.trim());
		expect(content).toContain(manualFooter.trim());
		expect(content.split("<!-- repotune:start copilot -->").length - 1).toBe(1);
		expect(content.split("<!-- repotune:end copilot -->").length - 1).toBe(1);
		expect(content).toContain("Use pnpm, never npm.");

		const { status: addStatus } = runCli(
			[
				"rule",
				"add",
				"Use manual content outside a managed block.",
				"--scope",
				"global",
			],
			dir,
		);
		expect(addStatus).toBe(0);
		expect(runCli(["sync", "--yes", "--agent", "copilot"], dir).status).toBe(0);

		content = await readFile(
			join(dir, ".github", "copilot-instructions.md"),
			"utf8",
		);
		expect(content.split("<!-- repotune:start copilot -->").length - 1).toBe(1);
		expect(content.split("<!-- repotune:end copilot -->").length - 1).toBe(1);
		expect(content).toContain("Use pnpm, never npm.");
		expect(content).toContain("Use manual content outside a managed block.");
		expect(content).toContain(manualHeader.trim());
		expect(content).toContain(manualFooter.trim());

		const doctor = runCli(["doctor"], dir);
		expect(doctor.status).toBe(0);
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

	it("init --agents antigravity --yes enables antigravity only", () => {
		const { status, stdout } = runCli(
			["init", "--agents", "antigravity", "--yes"],
			dir,
		);
		expect(status).toBe(0);
		expect(stdout).toContain("Agents: antigravity");
	});

	it("sync --agent antigravity writes .agents/rules/repotune.md with an antigravity managed block", async () => {
		await setupRepo(dir, ["antigravity"]);
		await addRule(makeRule("use-pnpm"), dir);
		const { status, stdout } = runCli(
			["sync", "--yes", "--agent", "antigravity"],
			dir,
		);
		expect(status).toBe(0);
		expect(stdout).toContain("1 file(s)");

		const content = await readFile(
			join(dir, ".agents/rules/repotune.md"),
			"utf8",
		);
		expect(content).toContain("<!-- repotune:start antigravity -->");
		expect(content).toContain("# RepoTune Rules");
		expect(content).toContain("- # use-pnpm");
	});

	it("sync --dry-run --agent antigravity writes zero files", async () => {
		await setupRepo(dir, ["antigravity"]);
		await addRule(makeRule("use-pnpm"), dir);
		const { status, stdout } = runCli(
			["sync", "--dry-run", "--agent", "antigravity"],
			dir,
		);
		expect(status).toBe(0);
		expect(stdout).toContain("Dry run: 1 file(s) would change");
		await expect(
			access(join(dir, ".agents/rules/repotune.md")),
		).rejects.toThrow();
	});

	it("doctor exits 0 after clean antigravity sync", async () => {
		await setupRepo(dir, ["antigravity"]);
		await addRule(makeRule("use-pnpm"), dir);
		expect(
			runCli(["sync", "--yes", "--agent", "antigravity"], dir).status,
		).toBe(0);
		expect(runCli(["doctor"], dir).status).toBe(0);
	});

	it("doctor after deleting antigravity-generated rules file exits 4", async () => {
		await setupRepo(dir, ["antigravity"]);
		await addRule(makeRule("use-pnpm"), dir);
		runCli(["sync", "--yes", "--agent", "antigravity"], dir);

		await unlink(join(dir, ".agents/rules/repotune.md"));
		const { status, stdout } = runCli(["doctor"], dir);
		expect(status).toBe(4);
		expect(stdout).toContain(".agents/rules/repotune.md");
	});
});
