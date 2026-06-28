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
	agentId: "cursor",
	supportsGlobalRules: true,
	supportsPathRules: true,
	supportsLanguageRules: false,
	supportsFrameworkRules: false,
	supportsImports: false,
	supportsSymlinks: false,
	managedBlockMarker: {
		start: "<!-- repotune:start cursor -->",
		end: "<!-- repotune:end cursor -->",
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

function makeDescription(content: string): string {
	const single = content.replace(/\n/g, " ");
	return single.length > 80 ? `${single.slice(0, 80)}...` : single;
}

function formatGlobs(pathPattern: string): string {
	return `[${JSON.stringify(pathPattern)}]`;
}

function renderMdc(
	description: string,
	globs: string,
	alwaysApply: boolean,
	content: string,
): string {
	const safeDesc = description.replace(/"/g, '\\"');
	return `---\ndescription: "${safeDesc}"\nglobs: ${globs}\nalwaysApply: ${alwaysApply}\n---\n\n${content}`;
}

export const cursorAdapter: AgentAdapter = {
	agentId: "cursor",
	capabilities,

	async plan(rules: Rule[], repoRoot: string): Promise<AdapterPlanResult> {
		const files: GeneratedFile[] = [];
		const warnings: Warning[] = [];

		for (const rule of rules) {
			if (rule.scope === "global") {
				files.push({
					agentId: "cursor",
					outputPath: `.cursor/rules/${rule.id}.mdc`,
					strategy: "create",
					content: renderMdc(
						makeDescription(rule.content),
						"[]",
						true,
						rule.content,
					),
					ruleIds: [rule.id],
				});
			} else if (rule.scope === "path") {
				if (!rule.pathPattern) {
					warnings.push({
						code: "CURSOR_MISSING_PATH_PATTERN",
						message: `Path rule '${rule.id}' has no pathPattern — skipped`,
						agentId: "cursor",
						ruleId: rule.id,
					});
					continue;
				}
				files.push({
					agentId: "cursor",
					outputPath: `.cursor/rules/${rule.id}.mdc`,
					strategy: "create",
					content: renderMdc(
						makeDescription(rule.content),
						formatGlobs(rule.pathPattern),
						false,
						rule.content,
					),
					ruleIds: [rule.id],
				});
			} else {
				warnings.push({
					code: "CURSOR_SCOPE_NOT_SUPPORTED_IN_V1",
					message: `Scope '${rule.scope}' is not supported by the Cursor adapter in v0.2.0`,
					agentId: "cursor",
					ruleId: rule.id,
				});
			}
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
			(f) => f.agentId === "cursor",
		)) {
			if (!(await fileExists(join(repoRoot, lf.path)))) {
				warnings.push({
					code: "FILE_MISSING",
					message: `${lf.path} missing (sync required)`,
					agentId: "cursor",
				});
			}
		}
		return warnings;
	},
};
