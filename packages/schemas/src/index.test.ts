import { describe, expect, it } from "vitest";
import {
	AgentIdSchema,
	GeneratedFileSchema,
	LockFileSchema,
	RuleSchema,
} from "./index";

describe("AgentIdSchema", () => {
	it("parses codex as a supported agent", () => {
		expect(AgentIdSchema.parse("codex")).toBe("codex");
	});

	it("parses devin as a supported agent", () => {
		expect(AgentIdSchema.parse("devin")).toBe("devin");
	});
});

describe("RuleSchema", () => {
	it("parses a valid global rule", () => {
		expect(() =>
			RuleSchema.parse({
				id: "use-pnpm-a3f2",
				content: "Use pnpm, never npm.",
				scope: "global",
				createdAt: "2024-01-15T10:05:00Z",
				updatedAt: "2024-01-15T10:05:00Z",
			}),
		).not.toThrow();
	});

	it("rejects scope=path without pathPattern", () => {
		expect(() =>
			RuleSchema.parse({
				id: "api-rule-a3f2",
				content: "Validate all inputs.",
				scope: "path",
				createdAt: "2024-01-15T10:05:00Z",
				updatedAt: "2024-01-15T10:05:00Z",
			}),
		).toThrow();
	});

	it("rejects scope=agent without agent", () => {
		expect(() =>
			RuleSchema.parse({
				id: "agent-rule-a3f2",
				content: "Use pnpm.",
				scope: "agent",
				createdAt: "2024-01-15T10:05:00Z",
				updatedAt: "2024-01-15T10:05:00Z",
			}),
		).toThrow();
	});
});

describe("GeneratedFileSchema", () => {
	it("rejects strategy=managed-block without managedBlockMarker", () => {
		expect(() =>
			GeneratedFileSchema.parse({
				agentId: "claude",
				outputPath: "CLAUDE.md",
				strategy: "managed-block",
				content: "- Use pnpm",
				ruleIds: ["use-pnpm-a3f2"],
			}),
		).toThrow();
	});

	it("parses strategy=managed-block with managedBlockMarker", () => {
		expect(() =>
			GeneratedFileSchema.parse({
				agentId: "claude",
				outputPath: "CLAUDE.md",
				strategy: "managed-block",
				content: "- Use pnpm",
				ruleIds: ["use-pnpm-a3f2"],
				managedBlockMarker: {
					start: "<!-- repotune:start claude -->",
					end: "<!-- repotune:end claude -->",
				},
			}),
		).not.toThrow();
	});
});

describe("LockFileSchema", () => {
	it("parses with generatedFiles array format", () => {
		expect(() =>
			LockFileSchema.parse({
				version: "0.2.0",
				lastSyncAt: "2024-01-15T10:30:00Z",
				generatedFiles: [
					{
						path: "CLAUDE.md",
						agentId: "claude",
						strategy: "managed-block",
						checksum: "abc123",
						checksumMode: "managed-block",
						ruleIds: ["use-pnpm-a3f2"],
						syncedAt: "2024-01-15T10:30:00Z",
					},
				],
			}),
		).not.toThrow();
	});
});
