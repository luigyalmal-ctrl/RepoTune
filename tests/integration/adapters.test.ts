import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doSync, makeRule, setupRepo } from "./helpers";

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
});

// I-19: Claude path rule → .claude/rules/{id}.md with globs: key, value is quoted
describe("I-19: Claude path rule", () => {
	it("creates .claude/rules/ file with globs: key and quoted value", async () => {
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
		expect(content).toContain("globs:");
		expect(content).not.toContain("paths:");
		// Value should be quoted string
		expect(content).toMatch(/globs:\s+"[^"]+"/);
	});

	it("glob pattern starting with * is quoted", async () => {
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
		// Pattern starts with * — must be quoted
		expect(content).toMatch(/globs:\s+"[*]/);
	});
});
