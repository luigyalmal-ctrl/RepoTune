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

/** Verified default workspace rules path (see antigravity.google/docs/rules-workflows). */
export const ANTIGRAVITY_RULES_OUTPUT_PATH = ".agents/rules/repotune.md";

const capabilities: AgentCapabilities = {
	agentId: "antigravity",
	supportsGlobalRules: true,
	supportsPathRules: false,
	supportsLanguageRules: false,
	supportsFrameworkRules: false,
	supportsImports: true,
	supportsSymlinks: false,
	managedBlockMarker: {
		start: "<!-- repotune:start antigravity -->",
		end: "<!-- repotune:end antigravity -->",
	},
};

function renderGlobalRules(rules: Rule[]): string {
	const bullets = rules.map((rule) => `- ${rule.content}`).join("\n");
	return `# RepoTune Rules\n\n${bullets}`;
}

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

	async plan(rules: Rule[], _repoRoot: string): Promise<AdapterPlanResult> {
		const files: GeneratedFile[] = [];
		const warnings: Warning[] = [];
		const { managedBlockMarker: marker } = capabilities;

		const globalRules = rules.filter((r) => r.scope === "global");
		const pathRules = rules.filter((r) => r.scope === "path");
		const unsupportedRules = rules.filter(
			(r) => r.scope !== "global" && r.scope !== "path",
		);

		for (const rule of pathRules) {
			warnings.push({
				code: "ANTIGRAVITY_PATH_SCOPE_NOT_SUPPORTED",
				message:
					"Antigravity path rules are not generated in RepoTune v0.2.0 because RepoTune does not map arbitrary globs to per-file Antigravity rule activation.",
				agentId: "antigravity",
				ruleId: rule.id,
			});
		}

		for (const rule of unsupportedRules) {
			warnings.push({
				code: "ANTIGRAVITY_SCOPE_NOT_SUPPORTED",
				message: `Scope '${rule.scope}' is not supported by the antigravity adapter`,
				agentId: "antigravity",
				ruleId: rule.id,
			});
		}

		if (globalRules.length > 0) {
			files.push({
				agentId: "antigravity",
				outputPath: ANTIGRAVITY_RULES_OUTPUT_PATH,
				strategy: "managed-block",
				content: renderGlobalRules(globalRules),
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
