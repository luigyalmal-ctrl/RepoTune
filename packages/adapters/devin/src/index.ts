import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type AdapterPlanResult,
	type AdapterValidationContext,
	type AgentAdapter,
	type AgentCapabilities,
	type GeneratedFile,
	RegistrySchema,
	type Rule,
	type Warning,
} from "@repotune/schemas";

const capabilities: AgentCapabilities = {
	agentId: "devin",
	supportsGlobalRules: true,
	supportsPathRules: false,
	supportsLanguageRules: false,
	supportsFrameworkRules: false,
	supportsImports: true,
	supportsSymlinks: false,
	managedBlockMarker: {
		start: "<!-- repotune:start devin -->",
		end: "<!-- repotune:end devin -->",
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

async function hasAgentsMdOverlap(repoRoot: string): Promise<boolean> {
	try {
		const raw = await readFile(join(repoRoot, ".ai", "registry.json"), "utf8");
		const registry = RegistrySchema.parse(JSON.parse(raw));
		return (
			registry.agents.includes("agents-md") || registry.agents.includes("codex")
		);
	} catch {
		return false;
	}
}

function renderGlobalRules(rules: Rule[]): string {
	const bullets = rules.map((rule) => `- ${rule.content}`).join("\n");
	return `## RepoTune Devin Rules\n\n${bullets}`;
}

export const devinAdapter: AgentAdapter = {
	agentId: "devin",
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
				code: "DEVIN_PATH_SCOPE_NOT_SUPPORTED",
				message:
					"Devin path rules are not generated in RepoTune v0.2.0 because Devin has no native project glob-scoped rule format.",
				agentId: "devin",
				ruleId: rule.id,
			});
		}

		for (const rule of unsupportedRules) {
			warnings.push({
				code: "DEVIN_SCOPE_NOT_SUPPORTED",
				message: `Scope '${rule.scope}' is not supported by the Devin adapter`,
				agentId: "devin",
				ruleId: rule.id,
			});
		}

		if (globalRules.length === 0) {
			return { generatedFiles: files, warnings };
		}

		if (await hasAgentsMdOverlap(repoRoot)) {
			warnings.push({
				code: "DEVIN_AGENTS_MD_CONFLICT",
				message:
					"Devin, codex, and agents-md all target AGENTS.md. RepoTune skips Devin output when another AGENTS.md adapter is enabled to avoid duplicate managed blocks.",
				agentId: "devin",
				path: "AGENTS.md",
			});
			return { generatedFiles: files, warnings };
		}

		files.push({
			agentId: "devin",
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
			(file) => file.agentId === "devin",
		)) {
			if (!(await fileExists(join(repoRoot, lf.path)))) {
				warnings.push({
					code: "FILE_MISSING",
					message: `${lf.path} missing (sync required)`,
					agentId: "devin",
				});
			}
		}
		return warnings;
	},
};
