import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rule } from "@repotune/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { antigravityAdapter } from "./index";

function rule(overrides: Partial<Rule> = {}): Rule {
	return {
		id: "use-pnpm-a3f2",
		content: "Use pnpm, never npm.",
		scope: "global",
		createdAt: "2024-01-15T10:05:00Z",
		updatedAt: "2024-01-15T10:05:00Z",
		...overrides,
	};
}

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "repotune-antigravity-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("antigravityAdapter.plan", () => {
	it("global rule targets .agents/AGENTS.md", async () => {
		const { generatedFiles } = await antigravityAdapter.plan([rule()], dir);
		expect(generatedFiles[0].outputPath).toBe(".agents/AGENTS.md");
		expect(generatedFiles[0].strategy).toBe("managed-block");
	});

	it("non-global rule emits ANTIGRAVITY_PATH_SCOPE_NOT_SUPPORTED warning", async () => {
		const { generatedFiles, warnings } = await antigravityAdapter.plan(
			[rule({ scope: "path", pathPattern: "src/**" })],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0].code).toBe("ANTIGRAVITY_PATH_SCOPE_NOT_SUPPORTED");
	});
});
