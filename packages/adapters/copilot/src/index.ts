import { access } from "node:fs/promises";
import { join } from "node:path";
import type {
	AdapterPlanResult,
	AdapterValidationContext,
	AgentAdapter,
	AgentCapabilities,
	GeneratedFile,
	Rule,
	Warning,
} from "@repotune/schemas";

const capabilities: AgentCapabilities = {
	agentId: "copilot",
	supportsGlobalRules: true,
	supportsPathRules: true,
	supportsLanguageRules: false,
	supportsFrameworkRules: false,
	supportsImports: false,
	supportsSymlinks: false,
	managedBlockMarker: {
		start: "<!-- repotune:start copilot -->",
		end: "<!-- repotune:end copilot -->",
	},
};

async function fileExists(p: string): Promise<boolean> {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

export const copilotAdapter: AgentAdapter = {
	agentId: "copilot",
	capabilities,

	async plan(rules: Rule[], repoRoot: string): Promise<AdapterPlanResult> {
		const files: GeneratedFile[] = [];
		const warnings: Warning[] = [];
		const { managedBlockMarker: marker } = capabilities;

		const globalRules = rules.filter((r) => r.scope === "global");
		const pathRules = rules.filter((r) => r.scope === "path");

		for (const rule of rules.filter(
			(r) => r.scope !== "global" && r.scope !== "path",
		)) {
			warnings.push({
				code: "COPILOT_SCOPE_NOT_SUPPORTED_IN_V1",
				message: `Scope '${rule.scope}' is not supported by the Copilot adapter in v0.1.2`,
				agentId: "copilot",
				ruleId: rule.id,
			});
		}

		if (globalRules.length > 0) {
			const inner = globalRules.map((r) => `- ${r.content}`).join("\n");
			const target = ".github/copilot-instructions.md";
			// [SPEC CLARIFICATION] Always use managed-block — see claude adapter comment.
			files.push({
				agentId: "copilot",
				outputPath: target,
				strategy: "managed-block",
				content: inner,
				ruleIds: globalRules.map((r) => r.id),
				managedBlockMarker: marker,
			});
		}

		for (const rule of pathRules) {
			if (!rule.pathPattern) {
				warnings.push({
					code: "COPILOT_MISSING_PATH_PATTERN",
					message: `Path rule '${rule.id}' has no pathPattern — skipped`,
					agentId: "copilot",
					ruleId: rule.id,
				});
				continue;
			}

			files.push({
				agentId: "copilot",
				outputPath: `.github/instructions/${rule.id}.instructions.md`,
				strategy: "create",
				content: `---\napplyTo: "${rule.pathPattern}"\n---\n\n${rule.content}`,
				ruleIds: [rule.id],
			});
		}

		return { generatedFiles: files, warnings };
	},

	async validate({
		repoRoot,
		lockFile,
	}: AdapterValidationContext): Promise<Warning[]> {
		if (!lockFile) return [];
		const warnings: Warning[] = [];
		for (const lf of lockFile.generatedFiles.filter(
			(f) => f.agentId === "copilot",
		)) {
			if (!(await fileExists(join(repoRoot, lf.path)))) {
				warnings.push({
					code: "FILE_MISSING",
					message: `${lf.path} missing (sync required)`,
					agentId: "copilot",
				});
			}
		}
		return warnings;
	},
};
