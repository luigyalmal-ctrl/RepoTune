import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rule } from "@repotune/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ANTIGRAVITY_RULES_OUTPUT_PATH, antigravityAdapter } from "./index";

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

describe("antigravityAdapter", () => {
	it("uses the antigravity agent id", () => {
		expect(antigravityAdapter.agentId).toBe("antigravity");
	});

	it("advertises documented capabilities", () => {
		expect(antigravityAdapter.capabilities).toMatchObject({
			agentId: "antigravity",
			supportsGlobalRules: true,
			supportsPathRules: false,
			supportsLanguageRules: false,
			supportsFrameworkRules: false,
			supportsImports: true,
			supportsSymlinks: false,
		});
	});

	it("global rule targets .agents/rules/repotune.md", async () => {
		const { generatedFiles, warnings } = await antigravityAdapter.plan(
			[rule()],
			dir,
		);
		expect(warnings).toHaveLength(0);
		expect(generatedFiles).toHaveLength(1);
		expect(generatedFiles[0]?.outputPath).toBe(ANTIGRAVITY_RULES_OUTPUT_PATH);
		expect(generatedFiles[0]?.outputPath).toBe(".agents/rules/repotune.md");
		expect(generatedFiles[0]?.strategy).toBe("managed-block");
		expect(generatedFiles[0]?.outputPath).not.toContain("\\");
	});

	it("generated content includes managed block markers content", async () => {
		const { generatedFiles } = await antigravityAdapter.plan([rule()], dir);
		expect(generatedFiles[0]?.content).toContain("# RepoTune Rules");
		expect(generatedFiles[0]?.content).toContain("- Use pnpm, never npm.");
	});

	it("multiple global rules produce deterministic output", async () => {
		const rules = [
			rule({ id: "rule-a", content: "Rule A." }),
			rule({ id: "rule-b", content: "Rule B." }),
		];
		const { generatedFiles } = await antigravityAdapter.plan(rules, dir);
		expect(generatedFiles[0]?.content).toBe(
			"# RepoTune Rules\n\n- Rule A.\n- Rule B.",
		);
	});

	it("path rules emit ANTIGRAVITY_PATH_SCOPE_NOT_SUPPORTED", async () => {
		const { generatedFiles, warnings } = await antigravityAdapter.plan(
			[rule({ scope: "path", pathPattern: "src/**" })],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0]?.code).toBe("ANTIGRAVITY_PATH_SCOPE_NOT_SUPPORTED");
	});

	it("non-path, non-global rules emit ANTIGRAVITY_SCOPE_NOT_SUPPORTED", async () => {
		const { generatedFiles, warnings } = await antigravityAdapter.plan(
			[rule({ scope: "language", language: "typescript" })],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0]?.code).toBe("ANTIGRAVITY_SCOPE_NOT_SUPPORTED");
	});

	it("returns no files and no warnings for empty rules", async () => {
		const { generatedFiles, warnings } = await antigravityAdapter.plan([], dir);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings).toHaveLength(0);
	});
});
