import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	addRule,
	getRules,
	initRegistry,
	loadRegistry,
	ruleIdExists,
} from "../src/registry";

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "rt-reg-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

function makeRule(id: string) {
	const now = new Date().toISOString();
	return {
		id,
		content: `rule ${id}`,
		scope: "global" as const,
		createdAt: now,
		updatedAt: now,
	};
}

describe("initRegistry", () => {
	it("creates a registry with no rules", async () => {
		const reg = await initRegistry(dir, ["claude"]);
		expect(reg.rules).toHaveLength(0);
		expect(reg.agents).toEqual(["claude"]);
		expect(reg.version).toBe("0.1.2");
	});
});

describe("addRule", () => {
	it("adds a rule and persists it", async () => {
		await initRegistry(dir, ["claude"]);
		await addRule(makeRule("lint"), dir);
		expect(await getRules(dir)).toHaveLength(1);
	});

	it("rejects duplicate rule IDs", async () => {
		await initRegistry(dir, ["claude"]);
		await addRule(makeRule("lint"), dir);
		await expect(addRule(makeRule("lint"), dir)).rejects.toThrow(
			"Rule ID 'lint' already exists",
		);
	});

	it("sorts rules by createdAt", async () => {
		await initRegistry(dir, ["claude"]);
		const now = new Date();
		const r1 = {
			...makeRule("b"),
			createdAt: new Date(now.getTime() + 1000).toISOString(),
			updatedAt: now.toISOString(),
		};
		const r2 = {
			...makeRule("a"),
			createdAt: now.toISOString(),
			updatedAt: now.toISOString(),
		};
		await addRule(r1, dir);
		await addRule(r2, dir);
		const ids = (await getRules(dir)).map((r) => r.id);
		expect(ids[0]).toBe("a");
		expect(ids[1]).toBe("b");
	});
});

describe("ruleIdExists", () => {
	it("returns true for existing rule, false for missing", async () => {
		await initRegistry(dir, ["claude"]);
		await addRule(makeRule("x"), dir);
		expect(await ruleIdExists("x", dir)).toBe(true);
		expect(await ruleIdExists("y", dir)).toBe(false);
	});
});
