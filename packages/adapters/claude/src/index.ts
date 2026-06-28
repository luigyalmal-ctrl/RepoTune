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
  agentId: 'claude',
  supportsGlobalRules: true,
  supportsPathRules: true,
  supportsLanguageRules: false,
  supportsFrameworkRules: false,
  supportsImports: true,
  supportsSymlinks: true,
  managedBlockMarker: {
    start: '<!-- repotune:start claude -->',
    end: '<!-- repotune:end claude -->',
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

export const claudeAdapter: AgentAdapter = {
  agentId: 'claude',
  capabilities,

  async plan(rules: Rule[], repoRoot: string): Promise<AdapterPlanResult> {
    const files: GeneratedFile[] = [];
    const warnings: Warning[] = [];
    const { managedBlockMarker: marker } = capabilities;

    const globalRules = rules.filter(r => r.scope === 'global');
    const pathRules = rules.filter(r => r.scope === 'path');

    for (const rule of rules.filter(r => r.scope !== 'global' && r.scope !== 'path')) {
      warnings.push({
        code: 'CLAUDE_SCOPE_NOT_SUPPORTED_IN_V1',
        message: `Scope '${rule.scope}' is not supported by the Claude adapter in v0.1.2`,
        agentId: 'claude',
        ruleId: rule.id,
      });
    }

    if (globalRules.length > 0) {
      const inner = globalRules.map(r => `- ${r.content}`).join('\n');
      const exists = await fileExists(join(repoRoot, 'CLAUDE.md'));

      files.push(
        exists
          ? {
              agentId: 'claude',
              outputPath: 'CLAUDE.md',
              strategy: 'managed-block',
              content: inner,
              ruleIds: globalRules.map(r => r.id),
              managedBlockMarker: marker,
            }
          : {
              agentId: 'claude',
              outputPath: 'CLAUDE.md',
              strategy: 'create',
              // Include markers so subsequent syncs (managed-block) find them
              content: `${marker.start}\n${inner}\n${marker.end}`,
              ruleIds: globalRules.map(r => r.id),
            },
      );
    }

    for (const rule of pathRules) {
      // Always quote glob values — required for patterns starting with * or {
      files.push({
        agentId: 'claude',
        outputPath: `.claude/rules/${rule.id}.md`,
        strategy: 'create',
        content: `---\nglobs: "${rule.pathPattern ?? ''}"\n---\n\n${rule.content}`,
        ruleIds: [rule.id],
      });
    }

    return { generatedFiles: files, warnings };
  },

  async validate({ repoRoot, lockFile }: AdapterValidationContext): Promise<Warning[]> {
    if (!lockFile) return [];
    const warnings: Warning[] = [];
    for (const lf of lockFile.generatedFiles.filter(f => f.agentId === 'claude')) {
      if (!(await fileExists(join(repoRoot, lf.path)))) {
        warnings.push({
          code: 'FILE_MISSING',
          message: `${lf.path} missing (sync required)`,
          agentId: 'claude',
        });
      }
    }
    return warnings;
  },
};
