import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	AgentAdapter,
	AgentId,
	GeneratedFile,
	Rule,
} from "@repotune/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLock } from "../src/lock";
import { addRule, initRegistry } from "../src/registry";
import { createSyncEngine } from "../src/sync-engine";

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "rt-sync-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

function makeRule(id: string): Rule {
	const now = new Date().toISOString();
	return {
		id,
		content: `# ${id}`,
		scope: "global",
		createdAt: now,
		updatedAt: now,
	};
}

function makeAdapter(agentId: AgentId, files: GeneratedFile[]): AgentAdapter {
	return {
		agentId,
		capabilities: {
			agentId,
			supportsGlobalRules: true,
			supportsPathRules: false,
			supportsLanguageRules: false,
			supportsFrameworkRules: false,
			supportsImports: false,
			supportsSymlinks: false,
			managedBlockMarker: {
				start: `<!-- repotune:start ${agentId} -->`,
				end: `<!-- repotune:end ${agentId} -->`,
			},
		},
		plan: async () => ({ generatedFiles: files, warnings: [] }),
		validate: async () => [],
	};
}

describe("planSync", () => {
	it("returns diff and plan with no conflicts for simple rules", async () => {
		await initRegistry(dir, ["claude"]);
		const rule = makeRule("no-any");
		const file: GeneratedFile = {
			agentId: "claude",
			outputPath: "CLAUDE.md",
			strategy: "create",
			content: rule.content,
			ruleIds: [rule.id],
		};
		const adapters = new Map<AgentId, AgentAdapter>([
			["claude", makeAdapter("claude", [file])],
		]);
		const engine = createSyncEngine(adapters);

		const preview = await engine.planSync([rule], {
			agents: ["claude"],
			repoRoot: dir,
		});
		expect(preview.plan.generatedFiles).toHaveLength(1);
		expect(preview.plan.conflicts).toHaveLength(0);
		expect(preview.diff.files[0].hasChanges).toBe(true);
	});
});

describe("applySync", () => {
	it("writes file and returns applied=true on happy path", async () => {
		await initRegistry(dir, ["claude"]);
		const rule = makeRule("no-any");
		await addRule(rule, dir);

		const file: GeneratedFile = {
			agentId: "claude",
			outputPath: "CLAUDE.md",
			strategy: "create",
			content: rule.content,
			ruleIds: [rule.id],
		};
		const adapters = new Map<AgentId, AgentAdapter>([
			["claude", makeAdapter("claude", [file])],
		]);
		const engine = createSyncEngine(adapters);

		const preview = await engine.planSync([rule], {
			agents: ["claude"],
			repoRoot: dir,
		});
		const result = await engine.applySync(preview, {
			agents: ["claude"],
			repoRoot: dir,
		});

		expect(result.applied).toBe(true);
		expect(await readFile(join(dir, "CLAUDE.md"), "utf8")).toBe(rule.content);
	});

	it("returns applied=false when diff has changed between plan and apply", async () => {
		await initRegistry(dir, ["claude"]);
		const rule = makeRule("no-any");
		await addRule(rule, dir);

		const file: GeneratedFile = {
			agentId: "claude",
			outputPath: "CLAUDE.md",
			strategy: "create",
			content: rule.content,
			ruleIds: [rule.id],
		};
		const adapters = new Map<AgentId, AgentAdapter>([
			["claude", makeAdapter("claude", [file])],
		]);
		const engine = createSyncEngine(adapters);

		const preview = await engine.planSync([rule], {
			agents: ["claude"],
			repoRoot: dir,
		});

		// Simulate filesystem change between plan and apply
		await writeFile(join(dir, "CLAUDE.md"), "external change", "utf8");

		const result = await engine.applySync(preview, {
			agents: ["claude"],
			repoRoot: dir,
		});
		expect(result.applied).toBe(false);
	});
});

describe("unsafe write skipping", () => {
	it("does not add skipped create files to lock.json", async () => {
		await initRegistry(dir, ["claude"]);
		const rule = makeRule("path-rule");
		await addRule(rule, dir);
		await mkdir(join(dir, ".claude/rules"), { recursive: true });
		await writeFile(
			join(dir, ".claude/rules/path-rule.md"),
			"unmanaged existing",
			"utf8",
		);

		const file: GeneratedFile = {
			agentId: "claude",
			outputPath: ".claude/rules/path-rule.md",
			strategy: "create",
			content: "new content",
			ruleIds: [rule.id],
		};
		const adapters = new Map<AgentId, AgentAdapter>([
			["claude", makeAdapter("claude", [file])],
		]);
		const engine = createSyncEngine(adapters);

		const preview = await engine.planSync([rule], {
			agents: ["claude"],
			repoRoot: dir,
		});
		expect(
			preview.plan.warnings.some((w) => w.code === "FILE_EXISTS_NOT_IN_LOCK"),
		).toBe(true);
		expect(
			preview.diff.files.find((f) => f.path === file.outputPath)?.hasChanges,
		).toBe(false);

		const result = await engine.applySync(preview, {
			agents: ["claude"],
			repoRoot: dir,
		});
		expect(result.applied).toBe(true);
		expect(
			result.warnings.some((w) => w.code === "FILE_EXISTS_NOT_IN_LOCK"),
		).toBe(true);
		expect(
			await readFile(join(dir, ".claude/rules/path-rule.md"), "utf8"),
		).toBe("unmanaged existing");

		const lock = await loadLock(dir);
		expect(lock?.generatedFiles.some((f) => f.path === file.outputPath)).toBe(
			false,
		);
	});

	it("does not include skipped files in backup manifest", async () => {
		await initRegistry(dir, ["claude"]);
		const rule = makeRule("path-rule");
		await addRule(rule, dir);
		await mkdir(join(dir, ".claude/rules"), { recursive: true });
		await writeFile(
			join(dir, ".claude/rules/path-rule.md"),
			"unmanaged existing",
			"utf8",
		);

		const file: GeneratedFile = {
			agentId: "claude",
			outputPath: ".claude/rules/path-rule.md",
			strategy: "create",
			content: "new content",
			ruleIds: [rule.id],
		};
		const adapters = new Map<AgentId, AgentAdapter>([
			["claude", makeAdapter("claude", [file])],
		]);
		const engine = createSyncEngine(adapters);

		const preview = await engine.planSync([rule], {
			agents: ["claude"],
			repoRoot: dir,
		});
		const result = await engine.applySync(preview, {
			agents: ["claude"],
			repoRoot: dir,
		});

		expect(result.backupPath).toBe("");
	});
});

describe("partial agent sync", () => {
	it("preserves lock entries for agents not in --agent sync", async () => {
		await initRegistry(dir, ["claude", "copilot"]);
		const rule = makeRule("shared");
		await addRule(rule, dir);

		const claudeFile: GeneratedFile = {
			agentId: "claude",
			outputPath: "CLAUDE.md",
			strategy: "create",
			content: rule.content,
			ruleIds: [rule.id],
		};
		const copilotFile: GeneratedFile = {
			agentId: "copilot",
			outputPath: ".github/copilot-instructions.md",
			strategy: "create",
			content: rule.content,
			ruleIds: [rule.id],
		};
		const adapters = new Map<AgentId, AgentAdapter>([
			["claude", makeAdapter("claude", [claudeFile])],
			["copilot", makeAdapter("copilot", [copilotFile])],
		]);
		const engine = createSyncEngine(adapters);

		const fullPreview = await engine.planSync([rule], {
			agents: ["claude", "copilot"],
			repoRoot: dir,
		});
		await engine.applySync(fullPreview, {
			agents: ["claude", "copilot"],
			repoRoot: dir,
		});

		let lock = await loadLock(dir);
		expect(lock?.generatedFiles).toHaveLength(2);
		expect(lock?.generatedFiles.some((f) => f.agentId === "copilot")).toBe(
			true,
		);

		const partialPreview = await engine.planSync([rule], {
			agents: ["claude"],
			repoRoot: dir,
		});
		await engine.applySync(partialPreview, {
			agents: ["claude"],
			repoRoot: dir,
		});

		lock = await loadLock(dir);
		expect(lock?.generatedFiles).toHaveLength(2);
		expect(lock?.generatedFiles.some((f) => f.agentId === "copilot")).toBe(
			true,
		);
		expect(lock?.generatedFiles.some((f) => f.agentId === "claude")).toBe(true);
	});
});
