import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type AdapterPlanResult,
	type AdapterValidationContext,
	type AgentAdapter,
	type AgentCapabilities,
	type AgentId,
	type GeneratedFile,
	RegistrySchema,
	type Rule,
	type Warning,
} from "@repotune/schemas";

const capabilities: AgentCapabilities = {
	agentId: "codex",
	supportsGlobalRules: true,
	supportsPathRules: false,
	supportsLanguageRules: false,
	supportsFrameworkRules: false,
	supportsImports: false,
	supportsSymlinks: false,
	managedBlockMarker: {
		start: "<!-- repotune:start codex -->",
		end: "<!-- repotune:end codex -->",
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

/** True when registry enables both agents; Codex output is intentionally skipped. */
export function isCodexSkippedForAgentsMd(agents: readonly AgentId[]): boolean {
	return agents.includes("codex") && agents.includes("agents-md");
}

async function hasAgentsMdOverlap(repoRoot: string): Promise<boolean> {
	try {
		const raw = await readFile(join(repoRoot, ".ai", "registry.json"), "utf8");
		const registry = RegistrySchema.parse(JSON.parse(raw));
		return isCodexSkippedForAgentsMd(registry.agents);
	} catch {
		return false;
	}
}

function renderGlobalRules(rules: Rule[]): string {
	const bullets = rules.map((rule) => `- ${rule.content}`).join("\n");
	return `## RepoTune Codex Rules\n\n${bullets}`;
}

export const codexAdapter: AgentAdapter = {
	agentId: "codex",
	capabilities,

	async plan(rules: Rule[], repoRoot: string): Promise<AdapterPlanResult> {
		const files: GeneratedFile[] = [];
		const warnings: Warning[] = [];
		const { managedBlockMarker: marker } = capabilities;

		const globalRules = rules.filter((rule) => rule.scope === "global");
		const pathRules = rules.filter((rule) => rule.scope === "path");
		const unsupportedRules = rules.filter(
			(rule) => rule.scope !== "global" && rule.scope !== "path",
		);

		for (const rule of pathRules) {
			warnings.push({
				code: "CODEX_PATH_SCOPE_NOT_SUPPORTED",
				message:
					"Codex path rules are not generated in RepoTune v0.2.0 because arbitrary glob patterns cannot be mapped safely to nested AGENTS.md files.",
				agentId: "codex",
				ruleId: rule.id,
			});
		}

		for (const rule of unsupportedRules) {
			warnings.push({
				code: "CODEX_SCOPE_NOT_SUPPORTED",
				message: `Scope '${rule.scope}' is not supported by the Codex adapter`,
				agentId: "codex",
				ruleId: rule.id,
			});
		}

		if (globalRules.length === 0) {
			return { generatedFiles: files, warnings };
		}

		if (await hasAgentsMdOverlap(repoRoot)) {
			warnings.push({
				code: "CODEX_AGENTS_MD_CONFLICT",
				message:
					"Codex and agents-md both target AGENTS.md. RepoTune skips Codex output when agents-md is enabled; agents-md owns AGENTS.md and Codex reads the generated file at runtime.",
				agentId: "codex",
				path: "AGENTS.md",
			});
			return { generatedFiles: files, warnings };
		}

		files.push({
			agentId: "codex",
			outputPath: "AGENTS.md",
			strategy: "managed-block",
			content: renderGlobalRules(globalRules),
			ruleIds: globalRules.map((rule) => rule.id),
			managedBlockMarker: marker,
		});

		return { generatedFiles: files, warnings };
	},

	async validate({
		repoRoot,
		lockFile,
	}: AdapterValidationContext): Promise<Warning[]> {
		if (!lockFile) return [];
		const warnings: Warning[] = [];
		for (const lf of lockFile.generatedFiles.filter(
			(file) => file.agentId === "codex",
		)) {
			if (!(await fileExists(join(repoRoot, lf.path)))) {
				warnings.push({
					code: "FILE_MISSING",
					message: `${lf.path} missing (sync required)`,
					agentId: "codex",
				});
			}
		}
		return warnings;
	},
};
