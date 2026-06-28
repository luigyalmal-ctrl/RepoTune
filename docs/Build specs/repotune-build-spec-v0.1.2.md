# RepoTune — Build Specification v0.1.2

**Status:** Specification — Ready for construction  
**Version:** 0.1.2  
**Supersedes:** v0.1.1  
**Scope:** MVP — Rule sync for Claude Code, GitHub Copilot, Cursor, AGENTS.md  
**Audience:** AI agents executing construction tasks

---

## Changelog from v0.1.1

| # | Change | Type | Source |
|---|--------|------|--------|
| 1 | Rename product: AgentBridge → **RepoTune** | Rename | Decision |
| 2 | `AgentAdapter.plan()` returns `AdapterPlanResult` (files + warnings), not `GeneratedFile[]` | Breaking | Analysis |
| 3 | `AgentAdapter` and `AdapterPlanResult` exported from `@repotune/schemas`, not from adapter packages | Breaking | Analysis |
| 4 | `RuleSchema` enforces conditional fields with `superRefine()` | Breaking | Analysis |
| 5 | `GeneratedFileSchema` enforces `managedBlockMarker` when strategy is `managed-block` | Breaking | Analysis |
| 6 | `LockFile` reorganized by file (not by rule), adds `checksumMode` | Breaking | Analysis |
| 7 | `BackupManifest` added: tracks `createdFiles`, `modifiedFiles` | Added | Analysis |
| 8 | `rollback` deletes files that were created by the last sync | Breaking | Analysis |
| 9 | Shared `ManagedBlockRenderer` used by both `DiffEngine` and `FileWriter` | Added | Analysis |
| 10 | `conflicts` always block sync — `--yes` skips prompts only, not conflict checks | Breaking | Analysis |
| 11 | Product boundary changed: "Dry-run mode for sync operations" (not "all write operations") | Correction | Analysis |
| 12 | `rule add` CLI exposes only `global` and `path` scopes | Breaking | Analysis |
| 13 | `plan()` described as "read-only planner", not "pure function" | Clarification | Analysis |
| 14 | `strategy: 'create'` semantics clarified: warns if file exists and is not in lock | Added | Analysis |
| 15 | `.gitignore` update by `init` is idempotent via managed block | Added | Analysis |
| 16 | Output order is deterministic: rules by `createdAt` asc, files by `agentId` + `outputPath` | Added | Analysis |
| 17 | Claude path rules: `globs:` key (not `paths:`) — bug confirmed in official repo | **Critical correction** | Verified |
| 18 | Claude path rules: glob patterns must be **quoted strings** in YAML | **Critical correction** | Verified |
| 19 | Repo root resolution defined: git root if `.git` found, else `cwd` | Added | Analysis |
| 20 | All stored paths are repo-relative with `/` separator (Windows safe) | Added | Analysis |
| 21 | Rule ID collision check before writing to registry | Added | Analysis |
| 22 | `doctor` checksum for `managed-block` files validates block content only, not full file | Added | Analysis |
| 23 | `SyncEngine` split into `planSync()` + `applySync()` | Breaking | Analysis |
| 24 | `adapter.validate()` receives `AdapterValidationContext` (repoRoot + lockFile) | Breaking | Analysis |
| 25 | Test suite expanded to cover all v0.1.2 behaviors | Added | Analysis |

---

## 0. Reading instructions for agents

This document is the single source of truth for building RepoTune v0.1.2.

Rules for any agent consuming this spec:

- This document defines the intended architecture. Follow it as the baseline, but before implementing any adapter, **verify the current official documentation for that agent** (Claude Code, GitHub Copilot, Cursor, etc.). If you find that a format, key name, file path, or frontmatter field has changed since this spec was written, update the relevant section of this plan with a note explaining what changed and why, then implement the corrected version.
- Do not expand scope beyond what is described. If you discover something genuinely new that affects correctness (not just a nice-to-have), flag it with a `[SPEC UPDATE]` note before proceeding.
- Do not proceed if an interface dependency from another Work Order is missing. Flag the dependency and stop.
- Every package has an owner agent. Do not modify packages outside your ownership.
- Every function must have a test as defined in Section 9.
- If a decision is not in this document and is not discoverable through documentation verification, ask before implementing.

---

## 1. Product boundary

### What v0.1.2 includes

- `init` command
- `rule add` command (scopes: `global`, `path` only)
- `rule list` command
- `sync` command (`--dry-run`, `--diff`, `--agent`, `--yes`)
- `doctor` command
- `rollback` command (`--backup`, `--yes`)
- Adapters: Claude Code, GitHub Copilot, Cursor, AGENTS.md
- Dry-run mode for **sync operations**
- Diff output before applying changes
- Managed blocks — never overwrite manual content
- Backup + backup manifest before every sync
- `registry.json` and `lock.json` (committed)
- `state.local.json` (gitignored)
- `.gitignore` entries managed idempotently by `init`
- Deterministic output order
- Defined exit codes for CI

### What v0.1.2 explicitly excludes

- Skill installation from external sources
- MCP management, Plugin management
- Security scanner, Marketplace
- Profile system, Hook system, Policy engine
- Semantic homologation
- Remote registry
- Windsurf, Devin, JetBrains, Codex, ChatGPT adapters
- `language`, `framework`, `agent` scopes in CLI (exist in schema, not exposed)
- `rule remove`, `rule edit` commands
- `--force` flag

---

## 2. Stack

| Concern | Decision |
|---|---|
| Runtime | Node.js >= 20 |
| Language | TypeScript 5.x, strict mode |
| Package manager | pnpm |
| CLI framework | Commander.js |
| Schema validation | Zod |
| File operations | fs-extra + native fs/promises |
| Diff rendering | diff (npm) |
| Interactive prompts | @inquirer/prompts |
| Test runner | Vitest |
| Linter / formatter | Biome |
| Build | tsup |
| Monorepo | pnpm workspaces |
| CI / Release | GitHub Actions + changesets |

No additional dependencies without approval from Architect Agent.

---

## 3. Repository structure

```
repotune/
├── README.md
├── LICENSE                        (MIT)
├── SECURITY.md
├── CONTRIBUTING.md
├── CHANGELOG.md
├── package.json                   (workspace root)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── packages/
│   ├── cli/                       (CLI Agent)
│   ├── core/                      (Core Agent)
│   ├── adapters/                  (Adapter Agent)
│   │   ├── claude/
│   │   ├── copilot/
│   │   ├── cursor/
│   │   └── agents-md/
│   └── schemas/                   (Architect Agent)
├── tests/
│   ├── fixtures/
│   └── integration/               (QA Agent)
├── docs/
│   ├── overview.md
│   ├── quickstart.md
│   └── concepts.md                (Docs Agent)
└── examples/
    └── basic-repo/
```

Package name prefix: `@repotune/` for all packages.  
CLI binary name: `repotune`.

---

## 4. Zod schemas and TypeScript types (package: schemas)

Owner: **Architect Agent**  
Path: `packages/schemas/src/`  
Package name: `@repotune/schemas`

All types are derived with `z.infer<>` from Zod schemas. No standalone `interface` or `type` for data models. All other packages import exclusively from `@repotune/schemas`.

### 4.1 AgentId

```typescript
export const AgentIdSchema = z.enum(['claude', 'copilot', 'cursor', 'agents-md']);
export type AgentId = z.infer<typeof AgentIdSchema>;
```

### 4.2 RuleScope

```typescript
export const RuleScopeSchema = z.enum([
  'global',
  'path',
  'language',    // defined for future use; not exposed in v0.1.2 CLI
  'framework',   // defined for future use; not exposed in v0.1.2 CLI
  'agent',       // defined for future use; not exposed in v0.1.2 CLI
]);
export type RuleScope = z.infer<typeof RuleScopeSchema>;
```

### 4.3 Rule — with conditional validation

```typescript
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
  if (rule.scope === 'path' && !rule.pathPattern) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pathPattern'],
      message: 'pathPattern is required when scope is path',
    });
  }
  if (rule.scope === 'language' && !rule.language) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['language'],
      message: 'language is required when scope is language',
    });
  }
  if (rule.scope === 'framework' && !rule.framework) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['framework'],
      message: 'framework is required when scope is framework',
    });
  }
  if (rule.scope === 'agent' && !rule.agent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['agent'],
      message: 'agent is required when scope is agent',
    });
  }
});
export type Rule = z.infer<typeof RuleSchema>;
```

### 4.4 AgentCapabilities

```typescript
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
```

### 4.5 GenerationStrategy

```typescript
export const GenerationStrategySchema = z.enum([
  'create',        // file does not exist; create it
  'overwrite',     // file exists and is fully managed by RepoTune
  'managed-block', // file has manual content; inject block only
  'skip',          // adapter cannot support this rule type
]);
export type GenerationStrategy = z.infer<typeof GenerationStrategySchema>;
```

**Semantics:**
- `create`: write if file does not exist. If file exists and is **not** in `lock.json` → emit `Warning` with code `FILE_EXISTS_NOT_IN_LOCK`, do not overwrite.
- `overwrite`: write if file is listed in `lock.json` as fully managed. If not in lock → emit `Warning`, do not overwrite.
- `managed-block`: always safe — reads existing content, injects or replaces block, preserves everything outside markers.
- `skip`: do nothing.

### 4.6 GeneratedFile — with conditional validation

```typescript
const BaseGeneratedFileSchema = z.object({
  agentId: AgentIdSchema,
  outputPath: z.string().min(1),   // always repo-relative, always uses '/' separator
  strategy: GenerationStrategySchema,
  content: z.string(),             // the generated content (not the full file)
  ruleIds: z.array(z.string()),
  managedBlockMarker: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
});

export const GeneratedFileSchema = BaseGeneratedFileSchema.superRefine((file, ctx) => {
  if (file.strategy === 'managed-block' && !file.managedBlockMarker) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['managedBlockMarker'],
      message: 'managedBlockMarker is required when strategy is managed-block',
    });
  }
});
export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;
```

### 4.7 AdapterPlanResult

This type is returned by `AgentAdapter.plan()`. It is the mechanism through which adapters communicate both generated files and warnings.

```typescript
export const AdapterPlanResultSchema = z.object({
  generatedFiles: z.array(GeneratedFileSchema),
  warnings: z.array(WarningSchema),
});
export type AdapterPlanResult = z.infer<typeof AdapterPlanResultSchema>;
```

### 4.8 AgentAdapter interface

Exported from `@repotune/schemas`. Core imports it from here. Adapters implement it. No circular dependencies.

```typescript
export interface AgentAdapter {
  readonly agentId: AgentId;
  readonly capabilities: AgentCapabilities;

  /**
   * Read-only planner.
   * May read existing target files to choose strategy (create vs managed-block).
   * Must not write files.
   * Must not create directories.
   * Must not mutate process state.
   * Must not throw — unsupported rule types return a Warning in AdapterPlanResult.
   */
  plan(rules: Rule[], repoRoot: string): Promise<AdapterPlanResult>;

  /**
   * Validate agent config state in the repo.
   * Does not modify files.
   */
  validate(context: AdapterValidationContext): Promise<Warning[]>;
}

export interface AdapterValidationContext {
  repoRoot: string;
  lockFile: LockFile | null;  // null if lock does not exist yet
}
```

### 4.9 SyncPlan

```typescript
export const SyncPlanSchema = z.object({
  agentIds: z.array(AgentIdSchema),
  generatedFiles: z.array(GeneratedFileSchema),
  conflicts: z.array(ConflictSchema),
  warnings: z.array(WarningSchema),
});
export type SyncPlan = z.infer<typeof SyncPlanSchema>;
```

### 4.10 SyncPreview

Returned by `planSync()`. Passed to `applySync()`.

```typescript
export const SyncPreviewSchema = z.object({
  plan: SyncPlanSchema,
  diff: DiffResultSchema,
});
export type SyncPreview = z.infer<typeof SyncPreviewSchema>;
```

### 4.11 FileDiff and DiffResult

```typescript
export const FileDiffSchema = z.object({
  path: z.string(),
  before: z.string().nullable(),  // null = file does not exist
  after: z.string(),              // full rendered file content (not just generated block)
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
```

**Critical:** `FileDiff.after` contains the **full rendered file** — i.e., what `FileWriter` would actually write to disk, including manual content outside markers. `DiffEngine` and `FileWriter` must use the same `ManagedBlockRenderer`.

### 4.12 Conflict and Warning

```typescript
export const ConflictSeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type ConflictSeverity = z.infer<typeof ConflictSeveritySchema>;

export const ConflictSchema = z.object({
  ruleId: z.string(),
  conflictingRuleId: z.string(),
  description: z.string(),
  severity: ConflictSeveritySchema,
});
export type Conflict = z.infer<typeof ConflictSchema>;

export const WarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  agentId: AgentIdSchema.optional(),
  ruleId: z.string().optional(),
});
export type Warning = z.infer<typeof WarningSchema>;
```

### 4.13 LockFile — organized by file, with checksumMode

```typescript
export const ChecksumModeSchema = z.enum([
  'full-file',      // checksum of entire file content (for strategy: overwrite/create)
  'managed-block',  // checksum of generated content inside block only
]);
export type ChecksumMode = z.infer<typeof ChecksumModeSchema>;

export const LockGeneratedFileSchema = z.object({
  path: z.string(),              // repo-relative, '/' separator
  agentId: AgentIdSchema,
  strategy: GenerationStrategySchema,
  checksum: z.string(),          // sha256
  checksumMode: ChecksumModeSchema,
  ruleIds: z.array(z.string()),  // which rules contributed to this file
  syncedAt: z.string().datetime(),
});
export type LockGeneratedFile = z.infer<typeof LockGeneratedFileSchema>;

export const LockFileSchema = z.object({
  version: z.string(),
  lastSyncAt: z.string().datetime(),
  generatedFiles: z.array(LockGeneratedFileSchema),  // keyed by path, not by ruleId
});
export type LockFile = z.infer<typeof LockFileSchema>;
```

### 4.14 BackupManifest

Written to the backup directory alongside the backed-up files.

```typescript
export const BackupManifestSchema = z.object({
  createdAt: z.string().datetime(),
  createdFiles: z.array(z.string()),   // files that did not exist before sync
  modifiedFiles: z.array(z.string()),  // files that existed and were modified
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;
```

### 4.15 Registry

```typescript
export const RegistrySchema = z.object({
  version: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  agents: z.array(AgentIdSchema),
  rules: z.array(RuleSchema),
});
export type Registry = z.infer<typeof RegistrySchema>;
```

### 4.16 LocalState

```typescript
export const LocalStateSchema = z.object({
  lastBackupPath: z.string().optional(),
  lastSyncAt: z.string().datetime().optional(),
});
export type LocalState = z.infer<typeof LocalStateSchema>;
```

---

## 5. Adapters (package: adapters)

Owner: **Adapter Agent**  
Path: `packages/adapters/`  
Package names: `@repotune/adapter-{id}`

All adapters implement `AgentAdapter` from `@repotune/schemas`.

### 5.1 Managed block format

When `strategy === 'managed-block'`, adapters set `managedBlockMarker` in `GeneratedFile`:

```
<!-- repotune:start {agentId} -->
...generated content...
<!-- repotune:end {agentId} -->
```

`ManagedBlockRenderer` in core handles all injection logic using these markers.

### 5.2 Adapter: Claude Code

File: `packages/adapters/claude/src/index.ts`

**Source of truth:** https://code.claude.com/docs/en/memory  
**Verified format for path-scoped rules:**

```markdown
---
globs: "src/**/*.ts"
---

Rule content here.
```

**[SPEC UPDATE — 2026-06-27]** Docs now show `paths:` array. Both keys emitted for compatibility.

**Verified facts (GitHub issues #17204, #13905, docs re-checked 2026-06-27):**

- **#17204** (closed "not planned"): `paths:` did not work reliably; `globs:` was the confirmed working key.
- **#13905** (closed "resolved"): invalid YAML in `paths:` docs was fixed — parser updated.
- **Current docs** (`code.claude.com/docs/en/memory`): now show `paths:` as a YAML array.
- Runtime verification was not possible in this environment (CLI unavailable).
- **Decision — Case B (both keys):** Emit `paths:` array (forward compatibility, current docs) AND `globs:` scalar (backward compatibility, prior runtime evidence). Duplicate YAML keys are syntactically valid; Claude Code ignores unrecognised keys.
- All pattern values are serialized with `JSON.stringify()` — handles quotes, backslashes, braces.
- Glob patterns starting with `*` or `{` **must be quoted** in YAML — unquoted values are invalid YAML.
- Rules with no frontmatter (or unrecognised keys only) load unconditionally at session start.

Capabilities:
```typescript
const claudeCapabilities: AgentCapabilities = {
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
```

`plan()` behavior:
- **Global rules** → one `GeneratedFile` targeting `CLAUDE.md`
  - If `CLAUDE.md` exists: strategy `managed-block`
  - If `CLAUDE.md` does not exist: strategy `create`
  - Content: Markdown list of all global rules combined
- **Path rules** → one `GeneratedFile` per rule targeting `.claude/rules/{ruleId}.md`
  - Strategy: `create`
  - File format — both `paths:` array and `globs:` scalar, value from `JSON.stringify(pathPattern)`:
    ```markdown
    ---
    paths:
      - "{rule.pathPattern}"
    globs: "{rule.pathPattern}"
    ---

    {rule.content}
    ```
  - `JSON.stringify` ensures all patterns are safely quoted regardless of content.
- **Other scopes** → `Warning` with code `CLAUDE_SCOPE_NOT_SUPPORTED_IN_V1`

### 5.3 Adapter: GitHub Copilot

File: `packages/adapters/copilot/src/index.ts`

**Source of truth:** https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions

**Verified format for path-specific instructions:**
```markdown
---
applyTo: "src/**/*.ts"
---

Rule content here.
```

`applyTo` is **required** for path-specific files to function. Files without it are treated as always-on or ignored depending on the client. Note: on GitHub.com, path-specific instructions currently apply to Copilot cloud agent and Copilot code review only.

Capabilities:
```typescript
const copilotCapabilities: AgentCapabilities = {
  agentId: 'copilot',
  supportsGlobalRules: true,
  supportsPathRules: true,
  supportsLanguageRules: false,
  supportsFrameworkRules: false,
  supportsImports: false,
  supportsSymlinks: false,
  managedBlockMarker: {
    start: '<!-- repotune:start copilot -->',
    end: '<!-- repotune:end copilot -->',
  },
};
```

`plan()` behavior:
- **Global rules** → one `GeneratedFile` targeting `.github/copilot-instructions.md`
  - If file exists: strategy `managed-block`
  - If file does not exist: strategy `create`
- **Path rules** → one `GeneratedFile` per rule targeting `.github/instructions/{ruleId}.instructions.md`
  - Strategy: `create`
  - `applyTo` is mandatory:
    ```markdown
    ---
    applyTo: "{rule.pathPattern}"
    ---

    {rule.content}
    ```
- **Other scopes** → `Warning` with code `COPILOT_SCOPE_NOT_SUPPORTED_IN_V1`

### 5.4 Adapter: Cursor

File: `packages/adapters/cursor/src/index.ts`

**Source of truth:** https://cursor.com/docs/context/rules

**Verified facts:**
- `.mdc` files require YAML frontmatter with `description`, `globs`, `alwaysApply`
- A plain `.md` in `.cursor/rules/` is **ignored** by Cursor's rule system
- Global rules: `alwaysApply: true`, `globs: []`
- Path rules: `alwaysApply: false`, `globs: ["{pathPattern}"]`

Capabilities:
```typescript
const cursorCapabilities: AgentCapabilities = {
  agentId: 'cursor',
  supportsGlobalRules: true,
  supportsPathRules: true,
  supportsLanguageRules: false,
  supportsFrameworkRules: false,
  supportsImports: false,
  supportsSymlinks: false,
  managedBlockMarker: {
    start: '<!-- repotune:start cursor -->',
    end: '<!-- repotune:end cursor -->',
  },
};
```

`plan()` behavior:
- **Global rules** → one `GeneratedFile` per rule targeting `.cursor/rules/{ruleId}.mdc`
  - Strategy: `create`
  - File format:
    ```markdown
    ---
    description: "{truncated content, max 80 chars, no newlines}"
    globs: []
    alwaysApply: true
    ---

    {rule.content}
    ```
- **Path rules** → one `GeneratedFile` per rule targeting `.cursor/rules/{ruleId}.mdc`
  - Strategy: `create`
  - File format:
    ```markdown
    ---
    description: "{truncated content, max 80 chars, no newlines}"
    globs: ["{rule.pathPattern}"]
    alwaysApply: false
    ---

    {rule.content}
    ```
- **Other scopes** → `Warning` with code `CURSOR_SCOPE_NOT_SUPPORTED_IN_V1`

Description truncation: take `rule.content`, strip all newlines, take first 80 characters, append `...` if truncated.

### 5.5 Adapter: AGENTS.md

File: `packages/adapters/agents-md/src/index.ts`

Capabilities:
```typescript
const agentsMdCapabilities: AgentCapabilities = {
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
```

`plan()` behavior:
- **Global rules** → one `GeneratedFile` targeting `AGENTS.md`
  - If `AGENTS.md` exists: strategy `managed-block`
  - If `AGENTS.md` does not exist: strategy `create`
- **Non-global rules** → `Warning` with code `AGENTS_MD_SCOPE_NOT_SUPPORTED`

---

## 6. Core package

Owner: **Core Agent**  
Path: `packages/core/src/`  
Package name: `@repotune/core`

### 6.1 Responsibilities

Everything that touches the filesystem — reading, writing, backing up, restoring — belongs exclusively to core. Adapters never touch the filesystem for writing.

### 6.2 File layout

```
packages/core/src/
├── index.ts
├── registry.ts
├── lock.ts
├── local-state.ts
├── sync-engine.ts
├── diff-engine.ts
├── backup-manager.ts
├── conflict-detector.ts
├── file-writer.ts
├── managed-block-renderer.ts    ← NEW: shared renderer
└── path-resolver.ts
```

### 6.3 ManagedBlockRenderer — shared, critical

**Must be used by both `DiffEngine` and `FileWriter`.** This ensures `--dry-run` and actual sync produce identical output.

```typescript
export interface ManagedBlockRenderer {
  /**
   * Given the current file content (or null if file does not exist),
   * and the GeneratedFile, return the full string that would be written to disk.
   *
   * For strategy 'create' or 'overwrite': returns file.content directly.
   * For strategy 'managed-block':
   *   - If markers not found in currentContent: append block at end.
   *   - If markers found: replace content between markers with file.content.
   *   - Everything outside markers is preserved byte-for-byte.
   * For strategy 'skip': returns currentContent as-is (or empty string if null).
   */
  render(file: GeneratedFile, currentContent: string | null): string;
}
```

### 6.4 SyncEngine — split into plan and apply

```typescript
export interface SyncOptions {
  agents: AgentId[];
  repoRoot: string;
}

export interface SyncEngine {
  /**
   * Compute plan and diff. No writes. No backups.
   * Returns SyncPreview which can be passed to applySync().
   */
  planSync(rules: Rule[], options: SyncOptions): Promise<SyncPreview>;

  /**
   * Apply a previously computed SyncPreview to disk.
   * Creates backup, writes files, updates lock and local state.
   * Revalidates the plan before writing — cancels if the diff changed.
   */
  applySync(preview: SyncPreview, options: SyncOptions): Promise<SyncResult>;
}

export interface SyncResult {
  applied: boolean;
  backupPath: string;
  generatedFiles: LockGeneratedFile[];
}
```

Internal flow of `planSync()`:
```
1. Load adapters for requested agentIds
2. For each adapter: adapter.plan(rules, repoRoot) → AdapterPlanResult
3. Aggregate generatedFiles and warnings from all adapters into SyncPlan
4. Run conflictDetector.detect(rules) → Conflict[] → add to SyncPlan
5. For each GeneratedFile: read current file from disk
6. For each GeneratedFile: renderer.render(file, currentContent) → full rendered output
7. Build DiffResult by comparing rendered output vs current file content
8. Return SyncPreview { plan, diff }
```

Internal flow of `applySync()`:
```
1. Re-run planSync() to get fresh preview
2. Compare fresh diff vs passed preview diff
3. If diffs differ (filesystem changed between plan and apply): abort, return { applied: false }
4. If plan.conflicts.length > 0: abort, return { applied: false }
5. backupManager.createBackup(generatedFiles, repoRoot) → backupPath
6. For each GeneratedFile where hasChanges === true:
   a. fileWriter.write(file, repoRoot)
7. Build LockGeneratedFile[] with checksums and checksumMode
8. lockManager.save(buildLockFile(LockGeneratedFile[]), repoRoot)
9. localStateManager.save({ lastBackupPath, lastSyncAt }, repoRoot)
10. Return { applied: true, backupPath, generatedFiles }
```

### 6.5 RegistryManager

```typescript
export interface RegistryManager {
  load(repoRoot: string): Promise<Registry>;
  save(registry: Registry, repoRoot: string): Promise<void>;
  initialize(repoRoot: string, agents: AgentId[]): Promise<Registry>;
  addRule(rule: Rule, repoRoot: string): Promise<void>;
  getRules(repoRoot: string): Promise<Rule[]>;
  ruleIdExists(id: string, repoRoot: string): Promise<boolean>;
}
```

`addRule()` must call `ruleIdExists()` first. If the ID exists, generate a new suffix and retry (max 5 attempts, then throw).

Rules in `registry.json` are always stored sorted by `createdAt` ascending, then by `id`.

### 6.6 BackupManager

```typescript
export interface BackupManager {
  /**
   * Before sync:
   * 1. Determine which target files currently exist on disk → modifiedFiles
   * 2. Determine which target files do not exist → createdFiles (will be created by sync)
   * 3. Copy modifiedFiles into backup directory
   * 4. Write BackupManifest to backup directory as 'manifest.json'
   * Returns backup directory path.
   *
   * Backup location: .ai/.backups/{YYYY-MM-DDTHH-MM-SS}/
   * Colons replaced with dashes for Windows compatibility.
   */
  createBackup(files: GeneratedFile[], repoRoot: string): Promise<string>;

  /**
   * Restore from backup:
   * 1. Read manifest.json from backupPath
   * 2. Restore modifiedFiles from backup (overwrite current)
   * 3. Delete createdFiles from repo (files that did not exist before that sync)
   * 4. Remove empty parent directories created by AgentBridge if now empty
   */
  restoreBackup(backupPath: string, repoRoot: string): Promise<void>;

  /**
   * List backup directories sorted descending by timestamp.
   */
  listBackups(repoRoot: string): Promise<string[]>;
}
```

### 6.7 FileWriter

```typescript
export interface FileWriter {
  /**
   * Write file to disk using ManagedBlockRenderer.
   * - Reads current file content first.
   * - Renders full output via renderer.render().
   * - If rendered output is byte-identical to current file: skip write.
   * - Otherwise: write rendered output to disk.
   * - Creates parent directories if needed.
   * - For strategy 'skip': does nothing.
   * - For strategy 'create': only writes if file does not exist.
   *   If file exists and not in lock: emits warning, does not write.
   * - For strategy 'overwrite': only writes if file path is in lock as fully managed.
   *   If not in lock: emits warning, does not write.
   */
  write(file: GeneratedFile, repoRoot: string, lockFile: LockFile | null): Promise<Warning[]>;

  read(filePath: string): Promise<string | null>;
}
```

### 6.8 DiffEngine

```typescript
export interface DiffEngine {
  /**
   * For each GeneratedFile:
   * 1. Read current file from disk
   * 2. Render expected output via ManagedBlockRenderer
   * 3. Compare rendered output vs current content
   * Returns DiffResult with full rendered 'after' content in each FileDiff.
   */
  compute(files: GeneratedFile[], repoRoot: string): Promise<DiffResult>;
}
```

### 6.9 ConflictDetector

```typescript
export interface ConflictDetector {
  detect(rules: Rule[]): Conflict[];
}
```

v0.1.2 contradiction keyword pairs (all detected conflicts → severity `medium`):

```typescript
const contradictionPairs: [string, string][] = [
  ['pnpm', 'npm'],
  ['yarn', 'npm'],
  ['pnpm', 'yarn'],
  ['vitest', 'jest'],
  ['eslint', 'biome'],
];
```

Detection algorithm: for each pair `[a, b]`, if rule R1 contains `a` and rule R2 contains `b` (case-insensitive, whole-word match), emit `Conflict` with `ruleId: R1.id`, `conflictingRuleId: R2.id`.

### 6.10 PathResolver

```typescript
export interface PathResolver {
  /**
   * Find the repository root:
   * - Walk up from cwd looking for a .git directory
   * - If found: return that directory
   * - If not found: return cwd
   */
  findRepoRoot(fromDir: string): string;

  /**
   * Convert an absolute path to repo-relative path with '/' separator.
   * Always uses '/' regardless of OS.
   */
  toRepoRelative(absolutePath: string, repoRoot: string): string;

  /**
   * Convert repo-relative path to absolute path.
   */
  toAbsolute(repoRelativePath: string, repoRoot: string): string;
}
```

All paths stored in `registry.json`, `lock.json`, `state.local.json`, and all `GeneratedFile.outputPath` values must be repo-relative with `/` separator. PathResolver enforces this on output.

---

## 7. CLI package

Owner: **CLI Agent**  
Path: `packages/cli/src/`  
Package name: `@repotune/cli`  
Binary name: `repotune`

### 7.1 File layout

```
packages/cli/src/
├── index.ts
├── commands/
│   ├── init.ts
│   ├── rule-add.ts
│   ├── rule-list.ts
│   ├── sync.ts
│   ├── doctor.ts
│   └── rollback.ts
├── output/
│   ├── printer.ts
│   └── diff-printer.ts
└── utils/
    └── repo-root.ts
```

### 7.2 Exit codes

```
0  success
1  runtime error (unexpected exception)
2  validation error (invalid registry/schema)
3  conflicts detected — sync blocked
4  dirty state (generated files do not match lockfile checksums)
```

### 7.3 Command: init

```
repotune init
```

Behavior:
1. Detect `.ai/` existence. If exists: warn, prompt confirm.
2. Find repo root via `PathResolver.findRepoRoot(cwd)`.
3. Prompt (multi-select): which agents to enable? `[claude, copilot, cursor, agents-md]`
4. Create:
   ```
   .ai/
   .ai/rules/
   .ai/.backups/
   ```
5. Write initial `registry.json` (valid `Registry`, empty `rules`, selected agents).
6. Write initial `lock.json` (valid `LockFile`, empty `generatedFiles`).
7. Write initial `state.local.json` (empty `LocalState`).
8. Update `.gitignore` — idempotent via managed block:
   ```
   <!-- repotune:start gitignore -->
   # RepoTune local state
   .ai/.backups/
   .ai/state.local.json
   <!-- repotune:end gitignore -->
   ```
   If this block already exists, replace content inside it. If it does not exist, append.
9. Print summary.

Nothing outside `.ai/` and `.gitignore` is modified during `init`.

### 7.4 Command: rule add

```
repotune rule add [content]
repotune rule add "Use pnpm, never npm"
```

Behavior:
1. If `content` not provided: open `@inquirer/prompts` editor.
2. Prompt (single-select): scope? **`[global, path]`** — only these two are exposed in v0.1.2.
3. If scope `path`: prompt for glob pattern.
4. Generate `id`: slugify first 6 words (lowercase, hyphens) + `-` + 4-char random hex. Check collision via `registryManager.ruleIdExists()`. If collision, regenerate hex (max 5 attempts).
5. Append rule to `registry.json` via `registryManager.addRule()`.
6. Print: `Rule added: {id}. Run 'repotune sync' to apply.`

Does not write any agent files.

### 7.5 Command: rule list

```
repotune rule list
```

Behavior:
1. Load `registry.json`.
2. Print table sorted by `createdAt` ascending:
   ```
   ID                    SCOPE    CONTENT
   use-pnpm-a3f2         global   Use pnpm, never npm.
   api-validate-b8c1     path     src/api/** → Always validate...
   ```
3. Exit 0.

### 7.6 Command: sync

```
repotune sync
repotune sync --dry-run
repotune sync --diff
repotune sync --agent claude
repotune sync --agent claude --agent copilot
repotune sync --diff --yes
```

Flags:
- `--dry-run`: compute preview, show summary, exit 0. Never writes.
- `--diff`: show file-by-file diff via `diff-printer` before applying.
- `--agent <id>`: sync specific agents only (repeatable). Default: all enabled agents.
- `--yes`: skip confirmation prompts. Does NOT skip conflict checks.

Behavior:
1. Load `registry.json`.
2. Filter agents by `--agent` flags if provided.
3. Call `syncEngine.planSync(rules, { agents, repoRoot })` → `SyncPreview`.
4. **If `preview.plan.conflicts.length > 0`: print conflicts, exit 3. Always. `--yes` does not bypass this.**
5. If `--dry-run`: print summary of what would change, exit 0.
6. If `--diff`: render `DiffResult` via `diff-printer`.
7. If not `--yes`: prompt `Apply these changes? (y/N)`.
8. Call `syncEngine.applySync(preview, { agents, repoRoot })`.
9. Print result:
   ```
   Synced 3 rules → 4 files

   ✓ CLAUDE.md               (managed block updated)
   ✓ AGENTS.md               (managed block updated)
   + .github/copilot-instructions.md  (created)
   + .cursor/rules/use-pnpm-a3f2.mdc  (created)

   Backup: .ai/.backups/2024-01-15T10-30-00/
   ```
10. Exit 0 on success, exit 1 on error.

### 7.7 Command: doctor

```
repotune doctor
```

Behavior:
1. Load `registry.json`. If invalid: print error, exit 2.
2. Load `lock.json`. If missing or invalid: print warning, continue.
3. For each enabled agent: `adapter.validate({ repoRoot, lockFile })` → warnings.
4. For each entry in `lock.json.generatedFiles`:
   - Read file from disk
   - Compute checksum according to `checksumMode`:
     - `full-file`: sha256 of full file content
     - `managed-block`: sha256 of content between markers (the generated block only)
   - Compare with stored checksum
   - If mismatch and `checksumMode === 'managed-block'`: warn only (manual edits outside block are allowed)
   - If mismatch and `checksumMode === 'full-file'`: mark as dirty
5. Run `conflictDetector.detect(rules)`.
6. Print report.
7. Exit 0 if all healthy. Exit 4 if any dirty state. Exit 2 if registry invalid.

Report format:
```
RepoTune Doctor Report

Agents: claude, copilot, cursor, agents-md

✓ claude     — CLAUDE.md found, managed block valid
✓ copilot    — .github/copilot-instructions.md found, managed block valid
✗ cursor     — .cursor/rules/use-pnpm-a3f2.mdc missing (sync required)
✓ agents-md  — AGENTS.md found, managed block valid

Rules: 3 total
Conflicts: 0

Warnings:
  cursor: .cursor/rules/use-pnpm-a3f2.mdc missing
  → run 'repotune sync --agent cursor'
```

### 7.8 Command: rollback

```
repotune rollback
repotune rollback --backup .ai/.backups/2024-01-15T10-30-00
repotune rollback --yes
```

Behavior:
1. If `--backup` not specified: load `state.local.json` → `lastBackupPath`.
   - If no last backup: list via `backupManager.listBackups()` and prompt.
2. Read `manifest.json` from backup directory.
3. Show which files will be **restored** (modifiedFiles) and which will be **deleted** (createdFiles).
4. If not `--yes`: prompt `Restore these files? (y/N)`.
5. Call `backupManager.restoreBackup(backupPath, repoRoot)`.
6. Print: `Rollback complete. Restored {n} files, deleted {m} files.`

---

## 8. .ai/ folder specification

```
.ai/
├── rules/                     (optional — for human reference)
├── registry.json              (committed)
├── lock.json                  (committed)
├── state.local.json           (gitignored)
└── .backups/                  (gitignored)
    └── {YYYY-MM-DDTHH-MM-SS}/
        ├── manifest.json
        └── {backed-up files}
```

### 8.1 registry.json example

```json
{
  "version": "0.1.2",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "agents": ["claude", "copilot", "cursor", "agents-md"],
  "rules": [
    {
      "id": "use-pnpm-a3f2",
      "content": "Use pnpm, never npm.",
      "scope": "global",
      "createdAt": "2024-01-15T10:05:00Z",
      "updatedAt": "2024-01-15T10:05:00Z"
    }
  ]
}
```

### 8.2 lock.json example

```json
{
  "version": "0.1.2",
  "lastSyncAt": "2024-01-15T10:30:00Z",
  "generatedFiles": [
    {
      "path": "CLAUDE.md",
      "agentId": "claude",
      "strategy": "managed-block",
      "checksum": "abc123...",
      "checksumMode": "managed-block",
      "ruleIds": ["use-pnpm-a3f2", "test-vitest-b8c1"],
      "syncedAt": "2024-01-15T10:30:00Z"
    },
    {
      "path": ".cursor/rules/use-pnpm-a3f2.mdc",
      "agentId": "cursor",
      "strategy": "create",
      "checksum": "def456...",
      "checksumMode": "full-file",
      "ruleIds": ["use-pnpm-a3f2"],
      "syncedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 8.3 backup manifest.json example

```json
{
  "createdAt": "2024-01-15T10:30:00Z",
  "createdFiles": [
    ".cursor/rules/use-pnpm-a3f2.mdc",
    ".github/instructions/use-pnpm.instructions.md"
  ],
  "modifiedFiles": [
    "CLAUDE.md",
    "AGENTS.md"
  ]
}
```

### 8.4 .gitignore managed block (written by init)

```
<!-- repotune:start gitignore -->
# RepoTune local state
.ai/.backups/
.ai/state.local.json
<!-- repotune:end gitignore -->
```

---

## 9. Test plan

Owner: **QA Agent**

### 9.1 Unit tests

**schemas:**
- `RuleSchema.parse()` valid global rule → pass
- `RuleSchema.parse()` scope `path` without `pathPattern` → ZodError
- `RuleSchema.parse()` scope `agent` without `agent` → ZodError
- `GeneratedFileSchema.parse()` `managed-block` without `managedBlockMarker` → ZodError
- `GeneratedFileSchema.parse()` `managed-block` with `managedBlockMarker` → pass
- `LockFileSchema.parse()` with `generatedFiles[]` format → pass

**core/managed-block-renderer:**
- Strategy `create`: returns `file.content`
- Strategy `overwrite`: returns `file.content`
- Strategy `managed-block`, no markers in file: appends block at end
- Strategy `managed-block`, markers present: replaces only block, everything outside byte-identical
- Strategy `managed-block`, currentContent null: returns full block
- Strategy `skip`: returns currentContent as-is

**core/diff-engine:**
- Uses `ManagedBlockRenderer` (not raw content comparison)
- File does not exist: `{ before: null, hasChanges: true }`
- File exists, same rendered output: `{ hasChanges: false }`
- File exists, different: `{ hasChanges: true, before: originalContent, after: fullRenderedOutput }`
- `after` field equals what `FileWriter` would write

**core/file-writer:**
- Strategy `create`, file not exists: writes
- Strategy `create`, file exists, not in lock: does not write, returns Warning `FILE_EXISTS_NOT_IN_LOCK`
- Strategy `overwrite`, file in lock: writes
- Strategy `overwrite`, file not in lock: does not write, returns Warning
- Strategy `managed-block`: delegates to `ManagedBlockRenderer`, writes result
- Strategy `skip`: does nothing
- Byte-identical content: no write

**core/backup-manager:**
- `createBackup()` writes `manifest.json` with correct `createdFiles` and `modifiedFiles`
- `createBackup()` copies only existing files into backup dir
- `restoreBackup()` restores modifiedFiles from backup
- `restoreBackup()` deletes createdFiles from repo
- `listBackups()` returns sorted descending

**core/conflict-detector:**
- `["Use pnpm", "Use npm"]` → Conflict, severity `medium`
- `["Use Vitest", "Use Jest"]` → Conflict
- Non-conflicting → `[]`
- Case-insensitive match

**core/sync-engine:**
- `planSync()` does not write files
- `applySync()` aborts if `conflicts.length > 0`
- `applySync()` aborts if diff changed between plan and apply

**core/registry:**
- `addRule()` collision check: existing ID → regenerate suffix
- `addRule()` stores rules sorted by `createdAt` asc

**adapters/claude:**
- Global rule: targets `CLAUDE.md`
- Path rule: file content has `globs:` key (not `paths:`), value is quoted string
- Path rule with pattern starting `*`: value is `"*..."` (quoted)
- Language rule → Warning `CLAUDE_SCOPE_NOT_SUPPORTED_IN_V1`

**adapters/copilot:**
- Global rule: targets `.github/copilot-instructions.md`
- Path rule: file has `applyTo:` frontmatter
- Path rule with no `pathPattern`: Warning

**adapters/cursor:**
- Global rule: `.mdc` with `alwaysApply: true`, `globs: []`
- Path rule: `.mdc` with `alwaysApply: false`, `globs: ["..."]`
- Description max 80 chars, no newlines

**adapters/agents-md:**
- Global rule: targets `AGENTS.md`
- Non-global → Warning `AGENTS_MD_SCOPE_NOT_SUPPORTED`

### 9.2 Integration tests

All use real tmp directories. No `fs` mocks. Each test cleans up.

| ID | Scenario | Pass condition |
|----|----------|----------------|
| I-01 | `init` on empty dir | `.ai/` created, schemas valid, `.gitignore` has managed block |
| I-02 | `init` twice | `.gitignore` has block exactly once (idempotent) |
| I-03 | `rule add "Use pnpm"` global | `registry.json` has 1 rule, scope `global` |
| I-04 | `rule add` same content twice | Second add generates different ID (collision check) |
| I-05 | `sync --dry-run` | Zero files written, correct DiffResult |
| I-06 | `sync` full | All 4 adapters write correct files, `lock.json` updated, backup created |
| I-07 | `sync` twice, same rules | Second sync: all `hasChanges: false`, no rewrites |
| I-08 | `sync` + `rollback` | modifiedFiles restored byte-identical; createdFiles deleted |
| I-09 | `sync` with pre-existing `CLAUDE.md` with manual content | Manual content preserved byte-identical outside block |
| I-10 | `sync` with `CLAUDE.md` already has block | After sync: exactly one block in file |
| I-11 | `doctor` after clean sync | All agents healthy, exit 0 |
| I-12 | `doctor` after deleting generated file | Reports agent needs sync, exit 4 |
| I-13 | `doctor` with manual content change outside block | No dirty state — `checksumMode: managed-block` |
| I-14 | `sync` with conflicting rules | `SyncPreview.plan.conflicts` non-empty, CLI exits 3 |
| I-15 | `sync --yes` with conflicting rules | Still exits 3 — `--yes` does not bypass conflicts |
| I-16 | Copilot path rule | File has `applyTo:` frontmatter |
| I-17 | Cursor global rule | `.mdc` has `alwaysApply: true`, `globs: []` |
| I-18 | Cursor path rule | `.mdc` has `alwaysApply: false`, `globs: [...]` |
| I-19 | Claude path rule | `.claude/rules/{id}.md` has `globs:` key, value is quoted |
| I-20 | `create` strategy on file not in lock | Warning emitted, file not overwritten |

### 9.3 Test fixtures

```
tests/fixtures/
├── empty-repo/
├── repo-with-claude-md/
│   └── CLAUDE.md             (manual content, no managed block)
├── repo-with-managed-block/
│   └── CLAUDE.md             (contains repotune managed block)
├── repo-with-all-agents/
│   ├── .ai/registry.json
│   └── .ai/lock.json
└── rules/
    ├── rule-global.json
    ├── rule-path.json
    └── rule-agent.json
```

---

## 10. Work orders by agent

### Work Order 1 — Architect Agent

**Task:** Set up monorepo and schemas package.

**Inputs:** Section 3, Section 4.

**Deliverables:**
- Root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`
- `packages/schemas/src/index.ts` — all Zod schemas and inferred types from Section 4
- `packages/schemas/package.json` (name: `@repotune/schemas`)
- `packages/schemas/tsconfig.json`
- Unit tests — schemas block (Section 9.1)

**Acceptance criteria:**
- `pnpm install` succeeds
- `pnpm build` succeeds for schemas
- All schemas exported, all `superRefine()` validations active
- All schema unit tests pass
- Zero `any` types, strict mode

**Do not:** implement logic, CLI, adapters, core.

---

### Work Order 2 — Adapter Agent

**Task:** Implement all 4 adapters.

**Inputs:** Section 5, Section 4.

**Dependency:** Work Order 1 complete.

**Deliverables:**
- `packages/adapters/claude/src/index.ts`
- `packages/adapters/copilot/src/index.ts`
- `packages/adapters/cursor/src/index.ts`
- `packages/adapters/agents-md/src/index.ts`
- `packages/adapters/*/package.json`
- Unit tests — adapters block (Section 9.1)

**Acceptance criteria:**
- All adapters implement `AgentAdapter` from `@repotune/schemas`
- `plan()` is read-only: may read files, never writes
- `plan()` returns `AdapterPlanResult` (not `GeneratedFile[]`)
- `plan()` never throws — returns Warning for unsupported scopes
- Claude path rules use `globs:` key with quoted values
- Copilot path rules have `applyTo:` frontmatter
- Cursor `.mdc` has `description:`, `globs:`, `alwaysApply:`
- All unit tests pass, `pnpm build` succeeds

**Do not:** implement FileWriter, ManagedBlockRenderer, or any disk writes.

---

### Work Order 3 — Core Agent

**Task:** Implement core package.

**Inputs:** Section 6, Section 4.

**Dependency:** Work Order 1 complete.

**Deliverables:**
- All files under `packages/core/src/` from Section 6.2
- `packages/core/package.json` (name: `@repotune/core`)
- Unit tests — core block (Section 9.1)

**Acceptance criteria:**
- `ManagedBlockRenderer` is implemented and used by both `DiffEngine` and `FileWriter`
- `planSync()` and `applySync()` are separate — no combined `sync(dryRun)` method
- `applySync()` re-validates diff before writing, aborts if changed
- `applySync()` aborts if conflicts exist (does not check `--yes` — that's CLI's job)
- `BackupManager.createBackup()` writes `manifest.json` with `createdFiles` and `modifiedFiles`
- `BackupManager.restoreBackup()` deletes `createdFiles` and restores `modifiedFiles`
- `FileWriter.write()` enforces `create`/`overwrite` semantics from Section 4.5
- `checksum` in lock computed as sha256 of correct content per `checksumMode`
- `PathResolver` always outputs `/`-separated paths
- All unit tests pass, `pnpm build` succeeds

**Do not:** implement adapters. Call `adapter.plan()` through the `AgentAdapter` interface only.

---

### Work Order 4 — CLI Agent

**Task:** Implement CLI package.

**Inputs:** Section 7, Section 4, Section 8.

**Dependencies:** Work Orders 1, 2, 3 complete.

**Deliverables:**
- All files under `packages/cli/src/` from Section 7.1
- `packages/cli/package.json` (binary: `repotune`)
- Working `npx repotune` execution

**Acceptance criteria:**
- All 6 commands work as specified in Section 7
- Exit codes correct for all cases (Section 7.2)
- `--dry-run` writes zero files
- `--yes` skips prompts only, never skips conflict checks
- Conflicts always exit 3 regardless of flags
- `init` `.gitignore` update is idempotent
- `rule add` exposes only `global` and `path` scopes
- `npx repotune --help` lists all commands and flags
- `pnpm build` succeeds

**Do not:** implement any business logic. Delegate everything to `@repotune/core`.

---

### Work Order 5 — QA Agent

**Task:** Integration tests and full test verification.

**Inputs:** Section 9, Section 7, Section 8.

**Dependencies:** Work Orders 1-4 complete.

**Deliverables:**
- `tests/fixtures/` (Section 9.3)
- `tests/integration/` — all tests from Section 9.2
- `pnpm test` passes everything

**Acceptance criteria:**
- Zero failing tests
- Real filesystem (tmp dir), no `fs` mocks
- Each test cleans up its tmp directory
- I-08: `createdFiles` deleted by rollback, `modifiedFiles` restored byte-identical
- I-09: manual content outside block byte-identical after sync
- I-13: `doctor` does not flag dirty when only manual content outside block changed
- I-15: `--yes` does not bypass conflicts
- I-20: `create` strategy does not overwrite unmanaged files

---

### Work Order 6 — Docs Agent

**Task:** Public documentation.

**Inputs:** Full spec. Section 1 (boundary). Section 7 (commands).

**Dependencies:** Work Orders 1-4 complete.

**Deliverables:**
- `README.md`
- `docs/overview.md`
- `docs/quickstart.md`
- `docs/concepts.md`
- `CONTRIBUTING.md`
- `SECURITY.md`

**Acceptance criteria:**
- README: problem in 3 sentences, install in 1 command, quickstart in 5 commands
- No claims about features outside v0.1.2 scope
- All code examples verified against real command output
- CONTRIBUTING: explains how to add an adapter with reference to `AgentAdapter` interface
- SECURITY: documents what RepoTune touches, dry-run guarantee, backup guarantee, managed block guarantee, rollback scope (restores modified + deletes created)

---

## 11. Definition of Done for v0.1.2

- [ ] `pnpm install` succeeds
- [ ] `pnpm build` succeeds for all packages
- [ ] `pnpm test` passes with zero failures
- [ ] `npx repotune init` works on empty directory, updates `.gitignore` idempotently
- [ ] `npx repotune rule add "Use pnpm"` adds rule to `registry.json`
- [ ] `npx repotune rule list` prints table
- [ ] `npx repotune sync --dry-run` shows diff, writes zero files
- [ ] `npx repotune sync` writes correct files for all 4 adapters
- [ ] Claude path rules: `globs:` key, quoted values
- [ ] Copilot path rules: `applyTo:` frontmatter
- [ ] Cursor `.mdc`: `description:`, `globs:`, `alwaysApply:`
- [ ] Manual content in pre-existing files preserved byte-identical
- [ ] `repotune rollback` restores modified files and deletes created files
- [ ] `repotune doctor` exits 0 after clean sync, 4 after deleting generated file
- [ ] `repotune doctor` does NOT report dirty when manual content outside block is edited
- [ ] Conflicts always exit 3 — `--yes` does not bypass
- [ ] Zero `any` types
- [ ] Biome lint zero errors
- [ ] README explains product in under 60 seconds

---

## 12. Resolved decisions

| Decision | Resolution |
|----------|------------|
| Product name | **RepoTune** |
| `.ai/` gitignore | `.backups/` and `state.local.json` gitignored; `registry.json`, `lock.json` committed |
| `SyncPlan` vs `InstallPlan` | `SyncPlan` |
| Adapter writes files? | No — read-only planners only |
| Backup authority | `BackupManager` in core only |
| Rollback of created files | `BackupManager` reads `manifest.json`, deletes `createdFiles` |
| Schemas: interfaces or Zod? | Zod schemas + `z.infer<>` |
| `AgentAdapter` location | `@repotune/schemas` — no circular dependencies |
| `plan()` return type | `AdapterPlanResult` `{ generatedFiles, warnings }` |
| Conditional schema validation | `superRefine()` on `RuleSchema` and `GeneratedFileSchema` |
| LockFile structure | By file — `generatedFiles[]` with `checksumMode` |
| `doctor` checksum for managed-block | Block content only — manual edits outside block do not trigger dirty |
| `--yes` vs conflicts | `--yes` skips prompts only. Conflicts always block. |
| Dry-run scope | Sync operations only |
| CLI rule scopes exposed | `global` and `path` only in v0.1.2 |
| `planSync` vs `applySync` | Split — `SyncEngine` has two methods |
| Claude path rule frontmatter key | `globs:` (not `paths:`) — bug confirmed in anthropics/claude-code#17204 |
| Claude glob values | Must always be quoted strings in YAML |
| Repo root resolution | `git root` if `.git` found ascending from cwd; else `cwd` |
| Path separator in stored files | Always `/`, never `\` |
| Rule ID collision | Check before write; regenerate suffix up to 5 times |
| `.gitignore` idempotency | Managed block in `.gitignore` — same mechanism as agent files |
| Output order | Rules: `createdAt` asc. Files: `agentId` + `outputPath`. |

## 13. Open questions (do not implement without resolution)

1. Windsurf adapter format — changed in late 2024; needs verification before implementing.
2. Whether adapter packages are published separately to NPM or bundled into one package.
3. Conflict detection algorithm — semantic approach deferred to v0.2.
4. `rule remove` and `rule edit` commands — deferred to v0.2.
5. Whether `language` and `framework` scopes should be exposed in v0.2 CLI or kept internal.

---

*End of RepoTune Build Specification v0.1.2*
