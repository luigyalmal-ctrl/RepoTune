import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addRule, createSyncEngine } from "@repotune/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALL_ADAPTERS, doSync, makeRule, setupRepo } from "./helpers";

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "rt-adapt-int-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

// I-16: Copilot path rule → file has applyTo: frontmatter
describe("I-16: Copilot path rule", () => {
	it("creates instructions file with applyTo: frontmatter", async () => {
		await setupRepo(dir, ["copilot"]);
		const now = new Date().toISOString();
		const rules = [
			{
				id: "ts-strict",
				content: "Use strict TypeScript.",
				scope: "path" as const,
				pathPattern: "src/**/*.ts",
				createdAt: now,
				updatedAt: now,
			},
		];
		await doSync(dir, rules, ["copilot"]);
		const content = await readFile(
			join(dir, ".github", "instructions", "ts-strict.instructions.md"),
			"utf8",
		);
		expect(content).toContain("applyTo:");
		expect(content).toContain("src/**/*.ts");
		expect(content).toContain("Use strict TypeScript.");
	});
});

// I-17: Cursor global rule → .mdc with alwaysApply: true, globs: []
describe("I-17: Cursor global rule", () => {
	it("creates .mdc file with alwaysApply: true and empty globs", async () => {
		await setupRepo(dir, ["cursor"]);
		const rules = [makeRule("use-pnpm", { content: "Use pnpm." })];
		await doSync(dir, rules, ["cursor"]);
		const content = await readFile(
			join(dir, ".cursor", "rules", "use-pnpm.mdc"),
			"utf8",
		);
		expect(content).toContain("alwaysApply: true");
		expect(content).toContain("globs: []");
		expect(content).not.toContain("alwaysApply: false");
	});
});

// I-18: Cursor path rule → .mdc with alwaysApply: false, globs: [...]
describe("I-18: Cursor path rule", () => {
	it("creates .mdc file with alwaysApply: false and globs pattern", async () => {
		await setupRepo(dir, ["cursor"]);
		const now = new Date().toISOString();
		const rules = [
			{
				id: "ts-strict",
				content: "Use strict TypeScript.",
				scope: "path" as const,
				pathPattern: "src/**/*.ts",
				createdAt: now,
				updatedAt: now,
			},
		];
		await doSync(dir, rules, ["cursor"]);
		const content = await readFile(
			join(dir, ".cursor", "rules", "ts-strict.mdc"),
			"utf8",
		);
		expect(content).toContain("alwaysApply: false");
		expect(content).toContain("globs:");
		expect(content).toContain("src/**/*.ts");
	});

	it("second sync produces byte-identical .mdc files", async () => {
		await setupRepo(dir, ["cursor"]);
		const rules = [makeRule("use-pnpm", { content: "Use pnpm." })];
		await doSync(dir, rules, ["cursor"]);
		const afterFirst = await readFile(
			join(dir, ".cursor", "rules", "use-pnpm.mdc"),
			"utf8",
		);

		await doSync(dir, rules, ["cursor"]);
		const afterSecond = await readFile(
			join(dir, ".cursor", "rules", "use-pnpm.mdc"),
			"utf8",
		);

		expect(afterSecond).toBe(afterFirst);
	});
});

// I-19: Claude path rule → .claude/rules/{id}.md with both paths: array and globs: scalar
// [COMPATIBILITY NOTE] Both keys emitted: paths: per current docs (code.claude.com/docs/en/memory),
// globs: for backward runtime compatibility (anthropics/claude-code#17204, #13905).
describe("I-19: Claude path rule", () => {
	it("creates .claude/rules/ file with paths: array and globs: scalar, both quoted", async () => {
		await setupRepo(dir, ["claude"]);
		const now = new Date().toISOString();
		const rules = [
			{
				id: "ts-strict",
				content: "Use strict TypeScript.",
				scope: "path" as const,
				pathPattern: "src/**/*.ts",
				createdAt: now,
				updatedAt: now,
			},
		];
		await doSync(dir, rules, ["claude"]);
		const content = await readFile(
			join(dir, ".claude", "rules", "ts-strict.md"),
			"utf8",
		);
		// paths: array (current official docs format)
		expect(content).toContain("paths:");
		expect(content).toMatch(/paths:\s*\n\s+- "[^"]+"/);
		// globs: scalar (prior runtime compatibility)
		expect(content).toContain("globs:");
		expect(content).toMatch(/globs:\s+"[^"]+"/);
		// Both reference the same pattern
		expect(content).toContain('"src/**/*.ts"');
	});

	it("pattern starting with * is quoted in both keys", async () => {
		await setupRepo(dir, ["claude"]);
		const now = new Date().toISOString();
		const rules = [
			{
				id: "ts-all",
				content: "TypeScript everywhere.",
				scope: "path" as const,
				pathPattern: "**/*.ts",
				createdAt: now,
				updatedAt: now,
			},
		];
		await doSync(dir, rules, ["claude"]);
		const content = await readFile(
			join(dir, ".claude", "rules", "ts-all.md"),
			"utf8",
		);
		expect(content).toMatch(/paths:\s*\n\s+- "[*]/);
		expect(content).toMatch(/globs:\s+"[*]/);
	});
});

describe("Codex adapter", () => {
	it("creates AGENTS.md with a codex managed block for global rules", async () => {
		await setupRepo(dir, ["codex"]);
		const rules = [makeRule("use-pnpm", { content: "Use pnpm, never npm." })];
		await doSync(dir, rules, ["codex"]);

		const content = await readFile(join(dir, "AGENTS.md"), "utf8");
		expect(content).toContain("<!-- repotune:start codex -->");
		expect(content).toContain("## RepoTune Codex Rules");
		expect(content).toContain("Use pnpm, never npm.");
		expect(content).toContain("<!-- repotune:end codex -->");
	});

	it("does not generate nested files for path rules", async () => {
		await setupRepo(dir, ["codex"]);
		const now = new Date().toISOString();
		const rules = [
			{
				id: "ts-strict",
				content: "Use strict TypeScript.",
				scope: "path" as const,
				pathPattern: "src/**/*.ts",
				createdAt: now,
				updatedAt: now,
			},
		];
		const { preview } = await doSync(dir, rules, ["codex"]);
		expect(
			preview.plan.warnings.some(
				(warning) => warning.code === "CODEX_PATH_SCOPE_NOT_SUPPORTED",
			),
		).toBe(true);
		expect(preview.plan.generatedFiles).toHaveLength(0);
	});

	it("agents-md owns AGENTS.md when codex is also enabled", async () => {
		await setupRepo(dir, ["codex", "agents-md"]);
		const rules = [makeRule("use-pnpm", { content: "Use pnpm, never npm." })];
		const { preview } = await doSync(dir, rules, ["codex", "agents-md"]);

		expect(
			preview.plan.warnings.some((w) => w.code === "CODEX_AGENTS_MD_CONFLICT"),
		).toBe(true);
		expect(
			preview.plan.generatedFiles.filter((f) => f.agentId === "codex"),
		).toHaveLength(0);
		expect(
			preview.plan.generatedFiles.filter((f) => f.agentId === "agents-md"),
		).toHaveLength(1);
	});
});

describe("Devin adapter", () => {
	it("creates AGENTS.md with a devin managed block for global rules", async () => {
		await setupRepo(dir, ["devin"]);
		const rules = [makeRule("use-pnpm", { content: "Use pnpm, never npm." })];
		await doSync(dir, rules, ["devin"]);

		const content = await readFile(join(dir, "AGENTS.md"), "utf8");
		expect(content).toContain("<!-- repotune:start devin -->");
		expect(content).toContain("## RepoTune Devin Rules");
		expect(content).toContain("Use pnpm, never npm.");
		expect(content).toContain("<!-- repotune:end devin -->");
	});

	it("does not generate path rules", async () => {
		await setupRepo(dir, ["devin"]);
		const now = new Date().toISOString();
		const rules = [
			{
				id: "ts-strict",
				content: "Use strict TypeScript.",
				scope: "path" as const,
				pathPattern: "src/**/*.ts",
				createdAt: now,
				updatedAt: now,
			},
		];
		const { preview } = await doSync(dir, rules, ["devin"]);
		expect(
			preview.plan.warnings.some(
				(warning) => warning.code === "DEVIN_PATH_SCOPE_NOT_SUPPORTED",
			),
		).toBe(true);
		expect(preview.plan.generatedFiles).toHaveLength(0);
	});

	it("skips devin output when agents-md is enabled", async () => {
		await setupRepo(dir, ["devin", "agents-md"]);
		const rules = [makeRule("use-pnpm", { content: "Use pnpm, never npm." })];
		for (const rule of rules) await addRule(rule, dir);

		const engine = createSyncEngine(ALL_ADAPTERS);
		const preview = await engine.planSync(rules, {
			agents: ["devin"],
			repoRoot: dir,
		});
		expect(preview.plan.generatedFiles).toHaveLength(0);
		expect(
			preview.plan.warnings.some(
				(warning) => warning.code === "DEVIN_AGENTS_MD_CONFLICT",
			),
		).toBe(true);
	});
});

describe("Antigravity adapter", () => {
	it("creates .agents/AGENTS.md with an antigravity managed block for global rules", async () => {
		await setupRepo(dir, ["antigravity"]);
		const rules = [makeRule("use-pnpm", { content: "Use pnpm, never npm." })];
		await doSync(dir, rules, ["antigravity"]);

		const content = await readFile(join(dir, ".agents/AGENTS.md"), "utf8");
		expect(content).toContain("<!-- repotune:start antigravity -->");
		expect(content).toContain("- Use pnpm, never npm.");
		expect(content).toContain("<!-- repotune:end antigravity -->");
	});

	it("does not generate path rules", async () => {
		await setupRepo(dir, ["antigravity"]);
		const now = new Date().toISOString();
		const rules = [
			{
				id: "ts-strict",
				content: "Use strict TypeScript.",
				scope: "path" as const,
				pathPattern: "src/**/*.ts",
				createdAt: now,
				updatedAt: now,
			},
		];
		const { preview } = await doSync(dir, rules, ["antigravity"]);
		expect(
			preview.plan.warnings.some(
				(warning) => warning.code === "ANTIGRAVITY_PATH_SCOPE_NOT_SUPPORTED",
			),
		).toBe(true);
		expect(preview.plan.generatedFiles).toHaveLength(0);
	});
});
