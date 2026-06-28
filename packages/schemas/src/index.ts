import { z } from "zod";

// 4.1 AgentId
export const AgentIdSchema = z.enum([
	"claude",
	"copilot",
	"cursor",
	"codex",
	"agents-md",
	"devin",
	"antigravity",
]);
export type AgentId = z.infer<typeof AgentIdSchema>;

// 4.2 RuleScope
export const RuleScopeSchema = z.enum([
	"global",
	"path",
	"language", // defined for future use; not exposed in the v0.2.0 CLI
	"framework", // defined for future use; not exposed in the v0.2.0 CLI
	"agent", // defined for future use; not exposed in the v0.2.0 CLI
]);
export type RuleScope = z.infer<typeof RuleScopeSchema>;

// 4.3 Rule — with conditional validation
const BaseRuleSchema = z.object({
	id: z.string().min(1),
	content: z.string().min(1),
	scope: RuleScopeSchema,
	pathPattern: z.string().optional(),
	language: z.string().optional(),
	framework: z.string().optional(),
	agent: AgentIdSchema.optional(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export const RuleSchema = BaseRuleSchema.superRefine((rule, ctx) => {
	if (rule.scope === "path" && !rule.pathPattern) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["pathPattern"],
			message: "pathPattern is required when scope is path",
		});
	}
	if (rule.scope === "language" && !rule.language) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["language"],
			message: "language is required when scope is language",
		});
	}
	if (rule.scope === "framework" && !rule.framework) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["framework"],
			message: "framework is required when scope is framework",
		});
	}
	if (rule.scope === "agent" && !rule.agent) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["agent"],
			message: "agent is required when scope is agent",
		});
	}
});
export type Rule = z.infer<typeof RuleSchema>;

// 4.4 AgentCapabilities
export const AgentCapabilitiesSchema = z.object({
	agentId: AgentIdSchema,
	supportsGlobalRules: z.boolean(),
	supportsPathRules: z.boolean(),
	supportsLanguageRules: z.boolean(),
	supportsFrameworkRules: z.boolean(),
	supportsImports: z.boolean(),
	supportsSymlinks: z.boolean(),
	maxGlobalFileSizeBytes: z.number().optional(),
	managedBlockMarker: z.object({
		start: z.string(),
		end: z.string(),
	}),
});
export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;

// 4.5 GenerationStrategy
export const GenerationStrategySchema = z.enum([
	"create",
	"overwrite",
	"managed-block",
	"skip",
]);
export type GenerationStrategy = z.infer<typeof GenerationStrategySchema>;

// 4.6 GeneratedFile — with conditional validation
const BaseGeneratedFileSchema = z.object({
	agentId: AgentIdSchema,
	outputPath: z.string().min(1),
	strategy: GenerationStrategySchema,
	content: z.string(),
	ruleIds: z.array(z.string()),
	managedBlockMarker: z
		.object({
			start: z.string(),
			end: z.string(),
		})
		.optional(),
});

export const GeneratedFileSchema = BaseGeneratedFileSchema.superRefine(
	(file, ctx) => {
		if (file.strategy === "managed-block" && !file.managedBlockMarker) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["managedBlockMarker"],
				message:
					"managedBlockMarker is required when strategy is managed-block",
			});
		}
	},
);
export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;

// 4.12 Warning (defined before AdapterPlanResult which depends on it)
// [SPEC ADJUSTMENT] Optional `path` added for skipped-file warnings (e.g. FILE_EXISTS_NOT_IN_LOCK).
export const WarningSchema = z.object({
	code: z.string(),
	message: z.string(),
	agentId: AgentIdSchema.optional(),
	ruleId: z.string().optional(),
	path: z.string().optional(), // repo-relative output path, when warning refers to a specific file
});
export type Warning = z.infer<typeof WarningSchema>;

// 4.12 Conflict
export const ConflictSeveritySchema = z.enum([
	"critical",
	"high",
	"medium",
	"low",
]);
export type ConflictSeverity = z.infer<typeof ConflictSeveritySchema>;

export const ConflictSchema = z.object({
	ruleId: z.string(),
	conflictingRuleId: z.string(),
	description: z.string(),
	severity: ConflictSeveritySchema,
});
export type Conflict = z.infer<typeof ConflictSchema>;

// 4.7 AdapterPlanResult
export const AdapterPlanResultSchema = z.object({
	generatedFiles: z.array(GeneratedFileSchema),
	warnings: z.array(WarningSchema),
});
export type AdapterPlanResult = z.infer<typeof AdapterPlanResultSchema>;

// 4.13 LockFile — organized by file, with checksumMode
export const ChecksumModeSchema = z.enum(["full-file", "managed-block"]);
export type ChecksumMode = z.infer<typeof ChecksumModeSchema>;

export const LockGeneratedFileSchema = z.object({
	path: z.string(),
	agentId: AgentIdSchema,
	strategy: GenerationStrategySchema,
	checksum: z.string(),
	checksumMode: ChecksumModeSchema,
	ruleIds: z.array(z.string()),
	syncedAt: z.string().datetime(),
});
export type LockGeneratedFile = z.infer<typeof LockGeneratedFileSchema>;

export const LockFileSchema = z.object({
	version: z.string(),
	lastSyncAt: z.string().datetime(),
	generatedFiles: z.array(LockGeneratedFileSchema),
});
export type LockFile = z.infer<typeof LockFileSchema>;

// 4.14 BackupManifest
export const BackupManifestSchema = z.object({
	createdAt: z.string().datetime(),
	createdFiles: z.array(z.string()),
	modifiedFiles: z.array(z.string()),
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;

// 4.15 Registry
export const RegistrySchema = z.object({
	version: z.string(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
	agents: z.array(AgentIdSchema),
	rules: z.array(RuleSchema),
});
export type Registry = z.infer<typeof RegistrySchema>;

// 4.16 LocalState
export const LocalStateSchema = z.object({
	lastBackupPath: z.string().optional(),
	lastSyncAt: z.string().datetime().optional(),
});
export type LocalState = z.infer<typeof LocalStateSchema>;

// 4.11 FileDiff and DiffResult
export const FileDiffSchema = z.object({
	path: z.string(),
	before: z.string().nullable(),
	after: z.string(),
	hasChanges: z.boolean(),
});
export type FileDiff = z.infer<typeof FileDiffSchema>;

export const DiffResultSchema = z.object({
	files: z.array(FileDiffSchema),
	totalAdded: z.number(),
	totalRemoved: z.number(),
	totalUnchanged: z.number(),
});
export type DiffResult = z.infer<typeof DiffResultSchema>;

// 4.9 SyncPlan
export const SyncPlanSchema = z.object({
	agentIds: z.array(AgentIdSchema),
	generatedFiles: z.array(GeneratedFileSchema),
	conflicts: z.array(ConflictSchema),
	warnings: z.array(WarningSchema),
});
export type SyncPlan = z.infer<typeof SyncPlanSchema>;

// 4.10 SyncPreview
export const SyncPreviewSchema = z.object({
	plan: SyncPlanSchema,
	diff: DiffResultSchema,
});
export type SyncPreview = z.infer<typeof SyncPreviewSchema>;

// 4.8 AgentAdapter interface (exported from schemas — no circular deps)
export interface AdapterValidationContext {
	repoRoot: string;
	lockFile: LockFile | null;
}

export interface AgentAdapter {
	readonly agentId: AgentId;
	readonly capabilities: AgentCapabilities;

	/**
	 * Read-only planner. May read existing target files to choose strategy.
	 * Must not write files, create directories, mutate process state, or throw.
	 * Unsupported rule types return a Warning in AdapterPlanResult.
	 */
	plan(rules: Rule[], repoRoot: string): Promise<AdapterPlanResult>;

	/**
	 * Validate agent config state in the repo. Does not modify files.
	 */
	validate(context: AdapterValidationContext): Promise<Warning[]>;
}
