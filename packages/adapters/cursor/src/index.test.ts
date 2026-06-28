import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rule } from "@repotune/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cursorAdapter } from "./index";

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

function bodyAfterFrontmatter(content: string): string {
	const marker = "\n---\n\n";
	const idx = content.indexOf(marker);
	if (idx === -1) throw new Error("expected frontmatter block");
	return content.slice(idx + marker.length);
}

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "repotune-cursor-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("cursorAdapter.plan", () => {
	it("returns empty result for no rules", async () => {
		const { generatedFiles, warnings } = await cursorAdapter.plan([], dir);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings).toHaveLength(0);
	});

	it("global rule produces .mdc with alwaysApply: true and globs: []", async () => {
		const { generatedFiles } = await cursorAdapter.plan([rule()], dir);
		const f = generatedFiles[0];
		expect(f.outputPath).toBe(".cursor/rules/use-pnpm-a3f2.mdc");
		expect(f.content).toContain("alwaysApply: true");
		expect(f.content).toContain("globs: []");
	});

	it("path rule produces .mdc with alwaysApply: false and globs with pattern", async () => {
		const { generatedFiles } = await cursorAdapter.plan(
			[rule({ scope: "path", pathPattern: "src/**/*.ts" })],
			dir,
		);
		const f = generatedFiles[0];
		expect(f.content).toContain("alwaysApply: false");
		expect(f.content).toContain('globs: ["src/**/*.ts"]');
	});

	it("preserves rule.content after frontmatter block", async () => {
		const body = "Line one\nLine two";
		const { generatedFiles } = await cursorAdapter.plan(
			[rule({ content: body })],
			dir,
		);
		expect(bodyAfterFrontmatter(generatedFiles[0].content)).toBe(body);
	});

	it("description is max 80 chars and contains no newlines", async () => {
		const longContent = `${"A".repeat(100)}\nmore text`;
		const { generatedFiles } = await cursorAdapter.plan(
			[rule({ content: longContent })],
			dir,
		);
		const lines = generatedFiles[0].content.split("\n");
		const descLine = lines.find((l) => l.startsWith("description:")) ?? "";
		const inner = descLine.replace(/^description: "/, "").replace(/"$/, "");
		expect(inner.length).toBeLessThanOrEqual(83);
		expect(inner).not.toContain("\n");
	});

	it("escapes double quotes in description frontmatter", async () => {
		const { generatedFiles } = await cursorAdapter.plan(
			[rule({ content: 'Say "hello" always.' })],
			dir,
		);
		expect(generatedFiles[0].content).toContain(
			'description: "Say \\"hello\\" always."',
		);
	});

	it("serializes globs safely when pathPattern contains quotes", async () => {
		const pattern = 'src/**/"foo".ts';
		const { generatedFiles } = await cursorAdapter.plan(
			[rule({ scope: "path", pathPattern: pattern })],
			dir,
		);
		expect(generatedFiles[0].content).toContain(
			`globs: [${JSON.stringify(pattern)}]`,
		);
	});

	it("path rule without pathPattern emits warning and skips file", async () => {
		const badRule = {
			id: "bad-rule",
			content: "test",
			scope: "path",
			createdAt: "2024-01-15T10:05:00Z",
			updatedAt: "2024-01-15T10:05:00Z",
		} as Rule;

		const { generatedFiles, warnings } = await cursorAdapter.plan(
			[badRule],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0]?.code).toBe("CURSOR_MISSING_PATH_PATTERN");
	});

	it("language scope emits CURSOR_SCOPE_NOT_SUPPORTED_IN_V1 warning", async () => {
		const { generatedFiles, warnings } = await cursorAdapter.plan(
			[rule({ scope: "language", language: "typescript" })],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0]?.code).toBe("CURSOR_SCOPE_NOT_SUPPORTED_IN_V1");
	});

	it("plans one .mdc file per rule", async () => {
		const rules = [
			rule({ id: "global-a", scope: "global" }),
			rule({
				id: "path-b",
				scope: "path",
				pathPattern: "src/**/*.ts",
				content: "Strict TS.",
			}),
		];
		const { generatedFiles } = await cursorAdapter.plan(rules, dir);
		expect(generatedFiles).toHaveLength(2);
		expect(generatedFiles.map((f) => f.outputPath)).toEqual([
			".cursor/rules/global-a.mdc",
			".cursor/rules/path-b.mdc",
		]);
	});
});
