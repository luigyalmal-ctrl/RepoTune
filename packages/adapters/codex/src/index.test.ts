import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rule } from "@repotune/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexAdapter, isCodexSkippedForAgentsMd } from "./index";

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
	dir = await mkdtemp(join(tmpdir(), "repotune-codex-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("codexAdapter", () => {
	it("uses the codex agent id", () => {
		expect(codexAdapter.agentId).toBe("codex");
	});

	it("advertises documented capabilities", () => {
		expect(codexAdapter.capabilities).toMatchObject({
			agentId: "codex",
			supportsGlobalRules: true,
			supportsPathRules: false,
			supportsLanguageRules: false,
			supportsFrameworkRules: false,
			supportsImports: false,
			supportsSymlinks: false,
		});
		expect(codexAdapter.capabilities.managedBlockMarker).toEqual({
			start: "<!-- repotune:start codex -->",
			end: "<!-- repotune:end codex -->",
		});
	});

	it("global rules target AGENTS.md with repo-relative output", async () => {
		const { generatedFiles, warnings } = await codexAdapter.plan([rule()], dir);
		expect(warnings).toHaveLength(0);
		expect(generatedFiles).toHaveLength(1);
		expect(generatedFiles[0].outputPath).toBe("AGENTS.md");
		expect(generatedFiles[0].strategy).toBe("managed-block");
		expect(generatedFiles[0].content).toContain("## RepoTune Codex Rules");
		expect(generatedFiles[0].content).toContain("- Use pnpm, never npm.");
	});

	it("multiple global rules produce deterministic output ordering", async () => {
		const rules = [
			rule({ id: "rule-a", content: "Rule A." }),
			rule({ id: "rule-b", content: "Rule B." }),
		];
		const { generatedFiles } = await codexAdapter.plan(rules, dir);
		expect(generatedFiles.map((file) => file.outputPath)).toEqual([
			"AGENTS.md",
		]);
		expect(generatedFiles[0]?.content).toBe(
			"## RepoTune Codex Rules\n\n- Rule A.\n- Rule B.",
		);
	});

	it("path rules emit CODEX_PATH_SCOPE_NOT_SUPPORTED", async () => {
		const { generatedFiles, warnings } = await codexAdapter.plan(
			[rule({ scope: "path", pathPattern: "src/**/*.ts" })],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0]?.code).toBe("CODEX_PATH_SCOPE_NOT_SUPPORTED");
	});

	it("non-global, non-path rules emit CODEX_SCOPE_NOT_SUPPORTED", async () => {
		const { generatedFiles, warnings } = await codexAdapter.plan(
			[rule({ scope: "language", language: "typescript" })],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0]?.code).toBe("CODEX_SCOPE_NOT_SUPPORTED");
	});

	it("returns no files and no warnings for empty rules", async () => {
		const { generatedFiles, warnings } = await codexAdapter.plan([], dir);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings).toHaveLength(0);
	});

	it("skips codex output when agents-md is enabled", async () => {
		await mkdir(join(dir, ".ai"), { recursive: true });
		await writeFile(
			join(dir, ".ai", "registry.json"),
			JSON.stringify(
				{
					version: "0.2.0",
					createdAt: "2024-01-15T10:00:00Z",
					updatedAt: "2024-01-15T10:00:00Z",
					agents: ["codex", "agents-md"],
					rules: [],
				},
				null,
				2,
			),
			"utf8",
		);

		const { generatedFiles, warnings } = await codexAdapter.plan([rule()], dir);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0]?.code).toBe("CODEX_AGENTS_MD_CONFLICT");
		expect(warnings[0]?.path).toBe("AGENTS.md");
		expect(warnings[0]?.message).toContain("agents-md owns AGENTS.md");
	});

	it("isCodexSkippedForAgentsMd detects overlap", () => {
		expect(isCodexSkippedForAgentsMd(["codex", "agents-md"])).toBe(true);
		expect(isCodexSkippedForAgentsMd(["codex"])).toBe(false);
		expect(isCodexSkippedForAgentsMd(["agents-md"])).toBe(false);
	});
});
