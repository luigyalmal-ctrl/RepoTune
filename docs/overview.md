# RepoTune Overview

## What it does

RepoTune synchronizes AI assistant configuration across four agents from a single registry:

- **Claude Code** — `CLAUDE.md` and `.claude/rules/*.md`
- **GitHub Copilot** — `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`
- **Cursor** — `.cursor/rules/*.mdc`
- **AGENTS.md** — `AGENTS.md`

Rules are stored in `.ai/registry.json`. Running `repotune sync` reads the registry and writes the correct file format for each enabled agent.

## Architecture

```text
.ai/
├── registry.json      Rules source of truth (committed)
├── lock.json          Tracks which files RepoTune manages (committed)
├── state.local.json   Last backup path, last sync time (gitignored)
└── .backups/          Pre-sync snapshots (gitignored)
```

The monorepo packages:

| Package | Role |
| --- | --- |
| `@repotune/schemas` | Zod schemas and TypeScript types |
| `@repotune/core` | Filesystem logic, sync engine, backup manager |
| `@repotune/adapter-{id}` | Per-agent file format logic (read-only planners) |
| `@repotune/cli` | Commander CLI, interactive prompts |

## Rule scopes

| Scope | What it does | Supported by |
| --- | --- | --- |
| `global` | Applies to all files in the repo | All agents |
| `path` | Applies to files matching a glob | Claude, Copilot, Cursor |

Scopes `language`, `framework`, and `agent` are defined in the schema but not exposed in the v0.1.2 CLI.

## Managed blocks

When a file already exists (e.g., you have a hand-written `CLAUDE.md`), RepoTune injects a managed block instead of overwriting:

```text
<!-- repotune:start claude -->
# use-pnpm
Use pnpm, never npm.
<!-- repotune:end claude -->
```

Everything outside the block is preserved byte-for-byte. `repotune doctor` validates only the block content when `checksumMode` is `managed-block` — edits outside the block never trigger a dirty state.

## Conflict detection

RepoTune detects contradictory rules (e.g., "use pnpm" + "use npm") before applying. Conflicts always block sync. `--yes` skips confirmation prompts, but never conflict checks.

## Data flow

```text
repotune sync
  → loadRegistry(.ai/registry.json)
  → adapter.plan(rules, repoRoot)   [per enabled agent, read-only]
  → detectConflicts(plan)
  → createBackup(files, repoRoot)
  → writeGeneratedFile(file)        [per GeneratedFile]
  → saveLock(.ai/lock.json)
  → saveLocalState(.ai/state.local.json)
```

`applySync` re-runs `planSync` from the registry on disk to validate that nothing changed between preview and apply. If the diffs diverge (e.g., a rule was deleted between `--diff` and confirmation), sync aborts without writing.

## Versioning

v0.1.2 supports Claude Code, GitHub Copilot, Cursor, and AGENTS.md. See the [build spec](Build%20specs/repotune-build-spec-v0.1.2.md) for what is explicitly excluded.
