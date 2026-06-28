# RepoTune

Keep your AI assistant rules in sync — one source of truth for Claude Code, GitHub Copilot, Cursor, and AGENTS.md.

## The problem

Every AI assistant reads from a different file in a different format. You end up maintaining four copies of the same rules — they drift, conflict, and fall out of date.

## The solution

RepoTune stores your rules once in `.ai/registry.json` and writes the correct file for each agent. Edit one file, run one command.

## Install

```bash
npm install -g @repotune/cli
# or
npx repotune --help
```

## Quickstart

```bash
repotune init                          # create .ai/ and choose agents
repotune rule add "Use pnpm, not npm"  # add a global rule
repotune sync --dry-run                # preview what will change
repotune sync                          # apply to all agents
repotune rollback                      # undo the last sync
```

## What gets written

| Agent | File |
|---|---|
| Claude Code | `CLAUDE.md` (managed block) + `.claude/rules/*.md` |
| GitHub Copilot | `.github/copilot-instructions.md` + `.github/instructions/*.instructions.md` |
| Cursor | `.cursor/rules/*.mdc` |
| AGENTS.md | `AGENTS.md` (managed block) |

## Safety guarantees

- `--dry-run` writes zero files, always
- Backup created before applying sync changes in `.ai/.backups/`
- Manual content in pre-existing files is never touched (managed blocks inject alongside, not over, your content)
- `rollback` restores modified files byte-identical and deletes files created by the last sync
- Conflicts (e.g. "use pnpm" + "use npm") block sync until resolved

## Commands

```
repotune init                  Initialize RepoTune in this repository
repotune rule add [content]    Add a rule (prompts scope and pattern)
repotune rule list             List all rules in a table
repotune sync [options]        Sync rules to agent files
  --dry-run                    Show what would change, write nothing
  --diff                       Show line-by-line diff before applying
  --agent <id>                 Sync one agent (repeatable)
  --yes                        Skip confirmation prompt
repotune doctor                Check all generated files against lock
repotune rollback [options]    Restore from last backup
  --backup <path>              Use a specific backup directory
  --yes                        Skip confirmation prompt
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Runtime error |
| 2 | Registry invalid or missing |
| 3 | Conflicts detected — sync blocked |
| 4 | Dirty state — generated files do not match lock |

## License

MIT
