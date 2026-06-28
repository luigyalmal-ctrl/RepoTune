# Quickstart

## 1. Initialize

```bash
npx repotune init
```

This creates `.ai/` and prompts you to select which agents to enable. It also adds `.ai/.backups/` and `.ai/state.local.json` to `.gitignore` via a managed block.

If you want OpenAI Codex support, enable `codex`. If you want Devin support, enable `devin`. Do not enable `codex` or `devin` alongside `agents-md` unless you intentionally want `agents-md` to own `AGENTS.md` and the other adapter's output to be skipped.

## 2. Add rules

```bash
repotune rule add "Use pnpm, never npm"
```

Prompts for scope (`global` or `path`). For `path` scope, you'll also enter a glob pattern like `src/**/*.ts`.

Or open your editor for longer content:

```bash
repotune rule add   # opens $EDITOR
```

## 3. Preview changes

```bash
repotune sync --dry-run
```

Shows which files would change. Writes nothing.

For a line-by-line diff:

```bash
repotune sync --diff
```

## 4. Sync

```bash
repotune sync
```

Creates a backup in `.ai/.backups/`, then writes all agent files. Prompts for confirmation unless `--yes` is passed.

Sync a single agent:

```bash
repotune sync --agent claude
repotune sync --agent claude --agent copilot
repotune sync --agent codex
repotune sync --agent devin
```

## 5. Check health

```bash
repotune doctor
```

Validates every generated file against the lock. Reports missing files, modified content, and rule conflicts.

Exit 0 = healthy. Exit 4 = dirty (generated files modified externally).

## 6. Undo

```bash
repotune rollback
```

Restores modified files from the last backup and deletes files that were created by the last sync. Prompts for confirmation unless `--yes` is passed.

To roll back to a specific backup:

```bash
repotune rollback --backup .ai/.backups/2024-01-15T10-30-00
```

## Typical workflow

```bash
# First time
repotune init
repotune rule add "Use TypeScript strict mode"
repotune rule add "Prefer pnpm over npm"
repotune sync

# Adding rules later
repotune rule add "Use Vitest, not Jest"
repotune sync --diff   # review before applying
repotune sync --yes    # apply without prompting

# Checking in CI
repotune doctor        # exits 0 if everything is in sync
```

## Commit strategy

Commit `registry.json` and `lock.json`. They define what RepoTune manages and are safe for shared branches.

Do not commit `.ai/state.local.json` or `.ai/.backups/`. `repotune init` adds them to `.gitignore` automatically.
