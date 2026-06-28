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

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "repotune-cursor-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("cursorAdapter.plan", () => {
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

	it("description is max 80 chars and contains no newlines", async () => {
		const longContent = `${"A".repeat(100)}\nmore text`;
		const { generatedFiles } = await cursorAdapter.plan(
			[rule({ content: longContent })],
			dir,
		);
		const lines = generatedFiles[0].content.split("\n");
		const descLine = lines.find((l) => l.startsWith("description:")) ?? "";
		// Strip description: "..." wrapper to get inner value
		const inner = descLine.replace(/^description: "/, "").replace(/"$/, "");
		expect(inner.length).toBeLessThanOrEqual(83); // 80 chars + '...'
		expect(inner).not.toContain("\n");
	});
});
