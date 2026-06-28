import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	addRule,
	initRegistry,
	loadRegistry,
	ruleIdExists,
} from "@repotune/core";
import { RegistrySchema } from "@repotune/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeRule, patchGitignore, setupRepo } from "./helpers";

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "rt-int-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

// I-01: init on empty dir → .ai/ created, schemas valid, .gitignore has managed block
describe("I-01: init on empty directory", () => {
	it("creates .ai/ with valid schema files", async () => {
		await setupRepo(dir, ["claude", "copilot"]);
		const reg = await loadRegistry(dir);
		expect(() => RegistrySchema.parse(reg)).not.toThrow();
		expect(reg.agents).toEqual(["claude", "copilot"]);
		expect(reg.rules).toHaveLength(0);
	});

	it("writes .gitignore with managed block", async () => {
		await setupRepo(dir);
		const gi = await readFile(join(dir, ".gitignore"), "utf8");
		expect(gi).toContain("<!-- repotune:start gitignore -->");
		expect(gi).toContain("<!-- repotune:end gitignore -->");
		expect(gi).toContain(".ai/.backups/");
		expect(gi).toContain(".ai/state.local.json");
	});
});

// I-02: init twice → .gitignore has block exactly once
describe("I-02: init idempotent", () => {
	it(".gitignore block appears exactly once after double-init", async () => {
		await setupRepo(dir);
		// Simulate re-init: read current .gitignore and patch again
		const current = await readFile(join(dir, ".gitignore"), "utf8");
		const patched = patchGitignore(current);
		expect(patched.split("<!-- repotune:start gitignore -->").length - 1).toBe(
			1,
		);
	});
});

// I-03: rule add "Use pnpm" global → registry.json has 1 rule, scope global
describe("I-03: add global rule", () => {
	it("adds rule with global scope to registry", async () => {
		await setupRepo(dir);
		await addRule(
			{
				id: "use-pnpm",
				content: "Use pnpm, never npm.",
				scope: "global",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			dir,
		);
		const reg = await loadRegistry(dir);
		expect(reg.rules).toHaveLength(1);
		expect(reg.rules[0].scope).toBe("global");
		expect(reg.rules[0].id).toBe("use-pnpm");
	});
});

// I-04: rule add same content twice → CLI generates different IDs (core rejects duplicates)
describe("I-04: rule ID collision", () => {
	it("rejects duplicate rule IDs", async () => {
		await setupRepo(dir);
		const now = new Date().toISOString();
		const rule = {
			id: "my-rule",
			content: "Content.",
			scope: "global" as const,
			createdAt: now,
			updatedAt: now,
		};
		await addRule(rule, dir);
		await expect(addRule(rule, dir)).rejects.toThrow(
			"Rule ID 'my-rule' already exists",
		);
	});

	it("allows same content with different IDs", async () => {
		await setupRepo(dir);
		const now = new Date().toISOString();
		await addRule(
			{
				id: "my-rule-a1b2",
				content: "Content.",
				scope: "global",
				createdAt: now,
				updatedAt: now,
			},
			dir,
		);
		await addRule(
			{
				id: "my-rule-c3d4",
				content: "Content.",
				scope: "global",
				createdAt: now,
				updatedAt: now,
			},
			dir,
		);
		const reg = await loadRegistry(dir);
		expect(reg.rules).toHaveLength(2);
		expect(new Set(reg.rules.map((r) => r.id)).size).toBe(2);
	});

	it("ruleIdExists returns true for existing rule only", async () => {
		await setupRepo(dir);
		const now = new Date().toISOString();
		await addRule(
			{
				id: "x",
				content: "A",
				scope: "global",
				createdAt: now,
				updatedAt: now,
			},
			dir,
		);
		expect(await ruleIdExists("x", dir)).toBe(true);
		expect(await ruleIdExists("x-1", dir)).toBe(false);
	});
});
