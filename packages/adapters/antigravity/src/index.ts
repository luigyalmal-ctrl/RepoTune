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
	agentId: "antigravity",
	supportsGlobalRules: true,
	supportsPathRules: false,
	supportsLanguageRules: false,
	supportsFrameworkRules: false,
	supportsImports: false,
	supportsSymlinks: false,
	managedBlockMarker: {
		start: "<!-- repotune:start antigravity -->",
		end: "<!-- repotune:end antigravity -->",
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

export const antigravityAdapter: AgentAdapter = {
	agentId: "antigravity",
	capabilities,

	async plan(rules: Rule[], repoRoot: string): Promise<AdapterPlanResult> {
		const files: GeneratedFile[] = [];
		const warnings: Warning[] = [];
		const { managedBlockMarker: marker } = capabilities;

		const globalRules = rules.filter((r) => r.scope === "global");

		for (const rule of rules.filter((r) => r.scope !== "global")) {
			warnings.push({
				code: "ANTIGRAVITY_PATH_SCOPE_NOT_SUPPORTED",
				message: `Scope '${rule.scope}' is not supported by the antigravity adapter`,
				agentId: "antigravity",
				ruleId: rule.id,
			});
		}

		if (globalRules.length > 0) {
			const inner = globalRules.map((r) => `- ${r.content}`).join("\n");
			files.push({
				agentId: "antigravity",
				outputPath: ".agents/AGENTS.md",
				strategy: "managed-block",
				content: inner,
				ruleIds: globalRules.map((r) => r.id),
				managedBlockMarker: marker,
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
			(f) => f.agentId === "antigravity",
		)) {
			if (!(await fileExists(join(repoRoot, lf.path)))) {
				warnings.push({
					code: "FILE_MISSING",
					message: `${lf.path} missing (sync required)`,
					agentId: "antigravity",
				});
			}
		}
		return warnings;
	},
};
