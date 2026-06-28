import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rule } from "@repotune/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentsMdAdapter } from "./index";

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
	dir = await mkdtemp(join(tmpdir(), "repotune-agentsmd-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("agentsMdAdapter.plan", () => {
	it("global rule targets AGENTS.md", async () => {
		const { generatedFiles } = await agentsMdAdapter.plan([rule()], dir);
		expect(generatedFiles[0].outputPath).toBe("AGENTS.md");
	});

	it("non-global rule emits AGENTS_MD_SCOPE_NOT_SUPPORTED warning", async () => {
		const { generatedFiles, warnings } = await agentsMdAdapter.plan(
			[rule({ scope: "path", pathPattern: "src/**" })],
			dir,
		);
		expect(generatedFiles).toHaveLength(0);
		expect(warnings[0].code).toBe("AGENTS_MD_SCOPE_NOT_SUPPORTED");
	});
});
