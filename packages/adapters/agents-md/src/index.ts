import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AdapterPlanResult,
  AdapterValidationContext,
  AgentAdapter,
  AgentCapabilities,
  GeneratedFile,
  Rule,
  Warning,
} from '@repotune/schemas';

const capabilities: AgentCapabilities = {
  agentId: 'agents-md',
  supportsGlobalRules: true,
  supportsPathRules: false,
  supportsLanguageRules: false,
  supportsFrameworkRules: false,
  supportsImports: false,
  supportsSymlinks: false,
  managedBlockMarker: {
    start: '<!-- repotune:start agents-md -->',
    end: '<!-- repotune:end agents-md -->',
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

export const agentsMdAdapter: AgentAdapter = {
  agentId: 'agents-md',
  capabilities,

  async plan(rules: Rule[], repoRoot: string): Promise<AdapterPlanResult> {
    const files: GeneratedFile[] = [];
    const warnings: Warning[] = [];
    const { managedBlockMarker: marker } = capabilities;

    const globalRules = rules.filter(r => r.scope === 'global');

    for (const rule of rules.filter(r => r.scope !== 'global')) {
      warnings.push({
        code: 'AGENTS_MD_SCOPE_NOT_SUPPORTED',
        message: `Scope '${rule.scope}' is not supported by the AGENTS.md adapter`,
        agentId: 'agents-md',
        ruleId: rule.id,
      });
    }

    if (globalRules.length > 0) {
      const inner = globalRules.map(r => `- ${r.content}`).join('\n');
      const exists = await fileExists(join(repoRoot, 'AGENTS.md'));

      files.push(
        exists
          ? {
              agentId: 'agents-md',
              outputPath: 'AGENTS.md',
              strategy: 'managed-block',
              content: inner,
              ruleIds: globalRules.map(r => r.id),
              managedBlockMarker: marker,
            }
          : {
              agentId: 'agents-md',
              outputPath: 'AGENTS.md',
              strategy: 'create',
              content: `${marker.start}\n${inner}\n${marker.end}`,
              ruleIds: globalRules.map(r => r.id),
            },
      );
    }

    return { generatedFiles: files, warnings };
  },

  async validate({ repoRoot, lockFile }: AdapterValidationContext): Promise<Warning[]> {
    if (!lockFile) return [];
    const warnings: Warning[] = [];
    for (const lf of lockFile.generatedFiles.filter(f => f.agentId === 'agents-md')) {
      if (!(await fileExists(join(repoRoot, lf.path)))) {
        warnings.push({
          code: 'FILE_MISSING',
          message: `${lf.path} missing (sync required)`,
          agentId: 'agents-md',
        });
      }
    }
    return warnings;
  },
};
