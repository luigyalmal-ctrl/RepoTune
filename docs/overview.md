# RepoTune Overview

## What it does

RepoTune synchronizes AI assistant configuration across supported agents from a single registry:

- **Claude Code** — `CLAUDE.md` and `.claude/rules/*.md`
- **GitHub Copilot** — `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`
- **Cursor** — `.cursor/rules/*.mdc`
- **OpenAI Codex** — `AGENTS.md`
- **Devin** — `AGENTS.md`
- **AGENTS.md** — `AGENTS.md`
- **Antigravity** — `.agents/AGENTS.md`

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
| `global` | Applies to all files in the repo | Claude, Copilot, Cursor, Codex, Devin, AGENTS.md, Antigravity |
| `path` | Applies to files matching a glob | Claude, Copilot, Cursor |

Scopes `language`, `framework`, and `agent` are defined in the schema but not exposed in the v0.2.0 CLI.

## Devin status

- `IMPLEMENTED`: Devin global rule sync to `AGENTS.md` using `<!-- repotune:start devin -->` / `<!-- repotune:end devin -->`
- `UNSUPPORTED`: arbitrary path-scoped globs for Devin
- `PARTIAL`: Devin can import Cursor, Windsurf, and Claude Code rules via `.devin/config.json`, but RepoTune does not generate that config file in v0.2.0

`devin`, `codex`, and `agents-md` overlap because they all target `AGENTS.md`. RepoTune warns and skips `devin` output when `agents-md` or `codex` is enabled, so only one adapter should own that file in a given registry.

## Codex status

- `IMPLEMENTED`: global rules rendered into `AGENTS.md` with a Codex managed block
- `UNSUPPORTED`: arbitrary path-scoped globs for Codex
- `PARTIAL`: OpenAI documents nested Codex instructions, but RepoTune does not generate nested files until there is a safe mapping strategy

`codex` and `agents-md` overlap because they both target `AGENTS.md`. When both are enabled:

- `agents-md` owns `AGENTS.md` (one managed block).
- Codex output is skipped with `CODEX_AGENTS_MD_CONFLICT`.
- Codex still receives rules by reading the generated `AGENTS.md`.
- No Codex lock entry is created for skipped output.
- `repotune doctor` treats Codex as healthy when intentionally skipped.

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

v0.2.0 adds OpenAI Codex and Devin support. See the [v0.2.0 build notes](Build%20specs/repotune-build-spec-v0.2.0.md) for Codex and Devin-specific decisions and the [v0.1.2 build spec](Build%20specs/repotune-build-spec-v0.1.2.md) for the historical MVP baseline.
