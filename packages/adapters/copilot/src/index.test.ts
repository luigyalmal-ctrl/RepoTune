import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rule } from "@repotune/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copilotAdapter } from "./index";

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
	dir = await mkdtemp(join(tmpdir(), "repotune-copilot-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("copilotAdapter.plan", () => {
	it("global rule targets .github/copilot-instructions.md", async () => {
		const { generatedFiles } = await copilotAdapter.plan([rule()], dir);
		expect(generatedFiles[0].outputPath).toBe(
			".github/copilot-instructions.md",
		);
	});

	it("path rule file has applyTo: frontmatter", async () => {
		const { generatedFiles } = await copilotAdapter.plan(
			[rule({ scope: "path", pathPattern: "src/**/*.ts" })],
			dir,
		);
		const f = generatedFiles[0];
		expect(f.outputPath).toBe(
			".github/instructions/use-pnpm-a3f2.instructions.md",
		);
		expect(f.content).toContain('applyTo: "src/**/*.ts"');
	});

	it.each([
		'src/**/"special"/*.ts',
		"src\\windows\\**/*.ts",
		"src/has spaces/**/*.ts",
		"src/with,comma/**/*.ts",
		"src/**/*.{ts,tsx}",
	])(
		"path rule serializes applyTo safely for pattern %s",
		async (pathPattern) => {
			const expectedRule = rule({ scope: "path", pathPattern });
			const { generatedFiles } = await copilotAdapter.plan([expectedRule], dir);
			const f = generatedFiles[0];
			expect(f.outputPath).toBe(
				".github/instructions/use-pnpm-a3f2.instructions.md",
			);
			expect(f.content).toContain("---\n");
			expect(f.content).toContain("applyTo:");
			expect(f.content).toContain(JSON.stringify(pathPattern));
			expect(f.content.endsWith(`\n${expectedRule.content}`)).toBe(true);
		},
	);

	it("unsupported scope returns COPILOT_SCOPE_NOT_SUPPORTED_IN_V1 warning", async () => {
		const { warnings } = await copilotAdapter.plan(
			[rule({ scope: "language", language: "typescript" })],
			dir,
		);
		expect(warnings).toHaveLength(1);
		expect(warnings[0].code).toBe("COPILOT_SCOPE_NOT_SUPPORTED_IN_V1");
	});

	it("empty rules array returns no generated files and no warnings", async () => {
		const { generatedFiles, warnings } = await copilotAdapter.plan([], dir);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings).toHaveLength(0);
	});

	it("path rule without pathPattern emits warning and skips file", async () => {
		// Bypasses schema validation to test defensive guard in adapter
		const badRule = {
			id: "bad-rule",
			content: "test",
			scope: "path",
			createdAt: "2024-01-15T10:05:00Z",
			updatedAt: "2024-01-15T10:05:00Z",
		} as Rule;

		const { generatedFiles, warnings } = await copilotAdapter.plan(
			[badRule],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0].code).toBe("COPILOT_MISSING_PATH_PATTERN");
	});
});
