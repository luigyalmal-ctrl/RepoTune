# Concepts

## Registry

`.ai/registry.json` is the single source of truth for all rules. It contains:

- `agents` — which agents are enabled
- `rules` — ordered by `createdAt` ascending

Rules are written to this file by `repotune rule add` and read by `repotune sync`.

If `agents` contains both `codex` and `agents-md`, RepoTune treats that as an overlap. Both adapters target `AGENTS.md`, so `codex` is skipped with warning `CODEX_AGENTS_MD_CONFLICT` to prevent duplicate managed blocks. `agents-md` owns the file; Codex reads the generated `AGENTS.md` at runtime. Skipped Codex output is not written to the lock file, and `repotune doctor` reports Codex as healthy (intentionally skipped), not dirty.

If `agents` contains `devin` alongside `agents-md` or `codex`, RepoTune treats that as an overlap for the same reason: `devin` is skipped with warning `DEVIN_AGENTS_MD_CONFLICT`. When skipped, Devin reads the generated `AGENTS.md` at runtime. `repotune doctor` reports Devin as healthy with a message naming the owning adapter.

## Devin and AGENTS.md overlap

When `devin` is enabled with `agents-md` and/or `codex`:

| Concern | Behavior |
| --- | --- |
| File ownership | `agents-md` wins over `codex`; only one adapter writes `AGENTS.md` |
| Devin sync | Skipped; emits `DEVIN_AGENTS_MD_CONFLICT` on plan |
| Lock file | No Devin entry when output is skipped |
| Doctor | Devin reported as ✓ "AGENTS.md owned by agents-md" or "owned by codex"; exit 0 |

## Lock file

`.ai/lock.json` tracks which files RepoTune has generated and how. Each entry records:

- `path` — repo-relative path with `/` separator
- `agentId` — which adapter generated it
- `strategy` — how the file is managed
- `checksum` — sha256 of the tracked content
- `checksumMode` — `full-file` or `managed-block`
- `ruleIds` — which rules contributed to this file

The lock is used by `repotune doctor` to validate files, and by adapters to decide whether a file is safe to overwrite.

## Generation strategies

| Strategy | When used | Behavior |
|---|---|---|
| `create` | File does not exist | Write file. Skip if file exists but is not in lock. |
| `overwrite` | File is fully managed | Write if file is in lock as fully managed. |
| `managed-block` | File already exists with content | Inject block; preserve everything outside. |
| `skip` | Agent does not support this rule type | Do nothing. |

For Codex and Devin, RepoTune uses `managed-block` for global rules in `AGENTS.md` and `skip`-with-warning for path-scoped rules.

## Codex and agents-md overlap

When both `codex` and `agents-md` appear in `registry.agents`:

| Concern | Behavior |
| --- | --- |
| File ownership | `agents-md` writes the single `AGENTS.md` managed block |
| Codex sync | Skipped; emits `CODEX_AGENTS_MD_CONFLICT` on plan (dry-run and apply) |
| Codex runtime | Codex reads the generated `AGENTS.md` — no separate Codex block needed |
| Lock file | No Codex entry when output is skipped |
| Doctor | Codex reported as ✓ intentionally skipped, exit code 0 when `agents-md` is synced |

## Checksum modes

| Mode | What is checksummed |
|---|---|
| `full-file` | sha256 of the entire file content |
| `managed-block` | sha256 of the generated content between markers only |

`managed-block` is used when the adapter uses the `managed-block` strategy. This means edits outside the block (your manual content) do not trigger a dirty state in `repotune doctor`.

## Backups

Before every sync, RepoTune creates a backup in `.ai/.backups/{timestamp}/`:

```
.ai/.backups/2024-01-15T10-30-00/
├── manifest.json
├── CLAUDE.md          (copy of the file before sync)
└── AGENTS.md
```

`manifest.json` records:

- `modifiedFiles` — files that existed and were copied
- `createdFiles` — files that did not exist (will be deleted on rollback)

`repotune rollback` reads the manifest and restores `modifiedFiles` byte-identical, then deletes `createdFiles`.

## Conflict detection

RepoTune detects contradictory keyword pairs in rule content:

| Pair | Example |
|---|---|
| `pnpm` / `npm` | "Use pnpm" + "Use npm" |
| `yarn` / `npm` | — |
| `pnpm` / `yarn` | — |
| `vitest` / `jest` | "Use Vitest" + "Use Jest" |
| `eslint` / `biome` | — |

Detection is case-insensitive and whole-word. A conflict blocks `repotune sync` with exit code 3. Resolve by removing or editing the contradicting rules, then re-run sync.

## Adapter DI

`@repotune/core` never imports adapter packages directly. The CLI constructs a `Map<AgentId, AgentAdapter>` and passes it to `createSyncEngine()`. This keeps core free of adapter dependencies and prevents circular imports.

## Codex path rules

OpenAI documents Codex project guidance through `AGENTS.md`, `AGENTS.override.md`, and configured fallback filenames discovered per directory. RepoTune stores path rules as arbitrary globs, so v0.2.0 does not map Codex path rules automatically. Unsupported Codex path rules emit `CODEX_PATH_SCOPE_NOT_SUPPORTED`.

## Devin path rules

Devin reads project rules from `AGENTS.md`, `AGENT.md`, and `CLAUDE.md`, and can import rules from Cursor, Windsurf, and Claude Code. It does not document a native project glob-scoped rule format. RepoTune does not generate Devin path rules in v0.2.0. Unsupported Devin path rules emit `DEVIN_PATH_SCOPE_NOT_SUPPORTED`.

## Antigravity status

- `IMPLEMENTED`: Antigravity global rule sync to `.agents/rules/repotune.md` using `<!-- repotune:start antigravity -->` / `<!-- repotune:end antigravity -->`
- `UNSUPPORTED`: mapping arbitrary RepoTune path rules to Antigravity per-file Glob activation in v0.2.0
- `OUT OF SCOPE`: Antigravity workflows

Antigravity uses `.agents/rules/` (legacy `.agent/rules` is backward-compatible in Antigravity). This path does not conflict with Codex, Devin, or `agents-md`, which target root `AGENTS.md`.

## Antigravity path rules

Antigravity supports per-rule Glob activation in the IDE, but RepoTune stores path rules as arbitrary globs without a faithful one-to-one mapping to Antigravity rule files in v0.2.0. Unsupported path rules emit `ANTIGRAVITY_PATH_SCOPE_NOT_SUPPORTED`; other unsupported scopes emit `ANTIGRAVITY_SCOPE_NOT_SUPPORTED`.

## Path handling

All paths stored in `registry.json`, `lock.json`, and `GeneratedFile.outputPath` are:

- Repo-relative (relative to the directory containing `.git`)
- Always use `/` as separator (Windows-safe)

The `PathResolver` in core handles conversion between absolute OS paths and stored repo-relative paths.
