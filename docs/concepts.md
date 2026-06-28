# Concepts

## Registry

`.ai/registry.json` is the single source of truth for all rules. It contains:

- `agents` — which agents are enabled
- `rules` — ordered by `createdAt` ascending

Rules are written to this file by `repotune rule add` and read by `repotune sync`.

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

## Path handling

All paths stored in `registry.json`, `lock.json`, and `GeneratedFile.outputPath` are:

- Repo-relative (relative to the directory containing `.git`)
- Always use `/` as separator (Windows-safe)

The `PathResolver` in core handles conversion between absolute OS paths and stored repo-relative paths.
