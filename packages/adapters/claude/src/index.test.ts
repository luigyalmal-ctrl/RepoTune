import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rule } from "@repotune/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeAdapter } from "./index";

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
	dir = await mkdtemp(join(tmpdir(), "repotune-claude-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("claudeAdapter.plan", () => {
	it("global rule targets CLAUDE.md", async () => {
		const { generatedFiles } = await claudeAdapter.plan([rule()], dir);
		expect(generatedFiles[0].outputPath).toBe("CLAUDE.md");
	});

	it("path rule targets .claude/rules/{ruleId}.md", async () => {
		const { generatedFiles } = await claudeAdapter.plan(
			[rule({ scope: "path", pathPattern: "src/**/*.ts" })],
			dir,
		);
		expect(generatedFiles[0].outputPath).toBe(".claude/rules/use-pnpm-a3f2.md");
	});

	// [COMPATIBILITY NOTE] Both paths: (current docs) and globs: (prior runtime evidence) are
	// emitted. See anthropics/claude-code#17204 and #13905.
	it("path rule emits both paths: array and globs: scalar", async () => {
		const { generatedFiles } = await claudeAdapter.plan(
			[rule({ scope: "path", pathPattern: "src/**/*.ts" })],
			dir,
		);
		const content = generatedFiles[0].content;
		expect(content).toContain("paths:");
		expect(content).toContain('  - "src/**/*.ts"');
		expect(content).toContain('globs: "src/**/*.ts"');
	});

	it("rule content is preserved exactly after frontmatter", async () => {
		const body = "Use pnpm, never npm.";
		const { generatedFiles } = await claudeAdapter.plan(
			[rule({ scope: "path", pathPattern: "src/**/*.ts", content: body })],
			dir,
		);
		const content = generatedFiles[0].content;
		expect(content).toContain(`\n\n${body}`);
		// No content mangling
		expect(content.endsWith(body)).toBe(true);
	});

	it("path pattern beginning with * is quoted in both keys", async () => {
		const { generatedFiles } = await claudeAdapter.plan(
			[rule({ scope: "path", pathPattern: "*.ts" })],
			dir,
		);
		const content = generatedFiles[0].content;
		expect(content).toContain('  - "*.ts"');
		expect(content).toContain('globs: "*.ts"');
	});

	it("path pattern beginning with { is quoted in both keys", async () => {
		const { generatedFiles } = await claudeAdapter.plan(
			[rule({ scope: "path", pathPattern: "{src,lib}/**/*.ts" })],
			dir,
		);
		const content = generatedFiles[0].content;
		expect(content).toContain('  - "{src,lib}/**/*.ts"');
		expect(content).toContain('globs: "{src,lib}/**/*.ts"');
	});

	it("path pattern containing double quotes is safely escaped", async () => {
		const { generatedFiles } = await claudeAdapter.plan(
			[rule({ scope: "path", pathPattern: 'src/"quoted"/*.ts' })],
			dir,
		);
		const content = generatedFiles[0].content;
		// JSON.stringify escapes internal quotes — no bare " breaking the YAML string
		expect(content).toContain('\\"quoted\\"');
		// Entire frontmatter must be valid — no unmatched quotes
		const frontmatter = content.split("---")[1];
		expect(() =>
			JSON.parse(`{"test":${frontmatter.match(/globs:\s*(.+)/)?.[1]?.trim()}}`),
		).not.toThrow();
	});

	it("unsupported scope emits CLAUDE_SCOPE_NOT_SUPPORTED_IN_V1", async () => {
		const { generatedFiles, warnings } = await claudeAdapter.plan(
			[rule({ scope: "language", language: "typescript" })],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0].code).toBe("CLAUDE_SCOPE_NOT_SUPPORTED_IN_V1");
	});

	it("empty rules array returns no files and no warnings", async () => {
		const { generatedFiles, warnings } = await claudeAdapter.plan([], dir);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings).toHaveLength(0);
	});

	it("multiple global rules produce one CLAUDE.md containing all content", async () => {
		const { generatedFiles } = await claudeAdapter.plan(
			[
				rule({ id: "r1", content: "Rule one." }),
				rule({ id: "r2", content: "Rule two." }),
			],
			dir,
		);
		expect(generatedFiles).toHaveLength(1);
		expect(generatedFiles[0].outputPath).toBe("CLAUDE.md");
		expect(generatedFiles[0].content).toContain("Rule one.");
		expect(generatedFiles[0].content).toContain("Rule two.");
	});

	it("multiple path rules produce separate files", async () => {
		const { generatedFiles } = await claudeAdapter.plan(
			[
				rule({ id: "r1", scope: "path", pathPattern: "src/**/*.ts" }),
				rule({ id: "r2", scope: "path", pathPattern: "lib/**/*.ts" }),
			],
			dir,
		);
		expect(generatedFiles).toHaveLength(2);
		expect(generatedFiles.map((f) => f.outputPath)).toEqual([
			".claude/rules/r1.md",
			".claude/rules/r2.md",
		]);
	});
});
