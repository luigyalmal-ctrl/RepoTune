import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rule } from "@repotune/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { devinAdapter } from "./index";

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
	dir = await mkdtemp(join(tmpdir(), "repotune-devin-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

async function writeRegistry(agents: string[]): Promise<void> {
	await mkdir(join(dir, ".ai"), { recursive: true });
	await writeFile(
		join(dir, ".ai", "registry.json"),
		JSON.stringify(
			{
				version: "0.2.0",
				createdAt: "2024-01-15T10:00:00Z",
				updatedAt: "2024-01-15T10:00:00Z",
				agents,
				rules: [],
			},
			null,
			2,
		),
		"utf8",
	);
}

describe("devinAdapter", () => {
	it("uses the devin agent id", () => {
		expect(devinAdapter.agentId).toBe("devin");
	});

	it("advertises documented capabilities", () => {
		expect(devinAdapter.capabilities).toMatchObject({
			agentId: "devin",
			supportsGlobalRules: true,
			supportsPathRules: false,
			supportsLanguageRules: false,
			supportsFrameworkRules: false,
			supportsImports: true,
			supportsSymlinks: false,
		});
		expect(devinAdapter.capabilities.managedBlockMarker).toEqual({
			start: "<!-- repotune:start devin -->",
			end: "<!-- repotune:end devin -->",
		});
	});

	it("global rules target AGENTS.md with repo-relative output", async () => {
		const { generatedFiles, warnings } = await devinAdapter.plan([rule()], dir);
		expect(warnings).toHaveLength(0);
		expect(generatedFiles).toHaveLength(1);
		expect(generatedFiles[0].outputPath).toBe("AGENTS.md");
		expect(generatedFiles[0].strategy).toBe("managed-block");
		expect(generatedFiles[0].content).toContain("## RepoTune Devin Rules");
		expect(generatedFiles[0].content).toContain("- Use pnpm, never npm.");
	});

	it("multiple global rules produce deterministic output ordering", async () => {
		const rules = [
			rule({ id: "rule-a", content: "Rule A." }),
			rule({ id: "rule-b", content: "Rule B." }),
		];
		const { generatedFiles } = await devinAdapter.plan(rules, dir);
		expect(generatedFiles.map((file) => file.outputPath)).toEqual([
			"AGENTS.md",
		]);
		expect(generatedFiles[0]?.content).toBe(
			"## RepoTune Devin Rules\n\n- Rule A.\n- Rule B.",
		);
	});

	it("path rules emit DEVIN_PATH_SCOPE_NOT_SUPPORTED", async () => {
		const { generatedFiles, warnings } = await devinAdapter.plan(
			[rule({ scope: "path", pathPattern: "src/**/*.ts" })],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0]?.code).toBe("DEVIN_PATH_SCOPE_NOT_SUPPORTED");
	});

	it("non-global, non-path rules emit DEVIN_SCOPE_NOT_SUPPORTED", async () => {
		const { generatedFiles, warnings } = await devinAdapter.plan(
			[rule({ scope: "language", language: "typescript" })],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0]?.code).toBe("DEVIN_SCOPE_NOT_SUPPORTED");
	});

	it("returns no files and no warnings for empty rules", async () => {
		const { generatedFiles, warnings } = await devinAdapter.plan([], dir);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings).toHaveLength(0);
	});

	it("skips devin output when agents-md is enabled", async () => {
		await writeRegistry(["devin", "agents-md"]);
		const { generatedFiles, warnings } = await devinAdapter.plan([rule()], dir);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0]?.code).toBe("DEVIN_AGENTS_MD_CONFLICT");
		expect(warnings[0]?.path).toBe("AGENTS.md");
	});

	it("skips devin output when codex is enabled", async () => {
		await writeRegistry(["devin", "codex"]);
		const { generatedFiles, warnings } = await devinAdapter.plan([rule()], dir);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0]?.code).toBe("DEVIN_AGENTS_MD_CONFLICT");
		expect(warnings[0]?.path).toBe("AGENTS.md");
	});

	it("produces devin output when only devin is enabled", async () => {
		await writeRegistry(["devin"]);
		const { generatedFiles, warnings } = await devinAdapter.plan([rule()], dir);
		expect(generatedFiles).toHaveLength(1);
		expect(generatedFiles[0].outputPath).toBe("AGENTS.md");
		expect(warnings).toHaveLength(0);
	});
});
