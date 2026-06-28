# Security

## What RepoTune touches

RepoTune reads and writes files within your repository only. It does not:

- Make network requests
- Access environment variables, credentials, or secrets
- Modify files outside the repository root
- Execute arbitrary code from rules

The files it manages are deterministic and documented:

| File | Written by | Content |
|---|---|---|
| `CLAUDE.md` | Claude adapter | Your rules in Markdown |
| `.claude/rules/*.md` | Claude adapter | Path-scoped rules with YAML frontmatter |
| `.github/copilot-instructions.md` | Copilot adapter | Your rules in Markdown |
| `.github/instructions/*.instructions.md` | Copilot adapter | Path-scoped rules |
| `.cursor/rules/*.mdc` | Cursor adapter | Rules with YAML frontmatter |
| `AGENTS.md` | AGENTS.md adapter | Your rules in Markdown |
| `.gitignore` | `repotune init` | Managed block with two gitignore entries |
| `.ai/registry.json` | `repotune rule add` | Rule definitions |
| `.ai/lock.json` | `repotune sync` | Checksums and metadata |
| `.ai/state.local.json` | `repotune sync` | Last backup path and sync timestamp |
| `.ai/.backups/` | `repotune sync` | Copies of files before they were modified |

## Dry-run guarantee

`repotune sync --dry-run` and `repotune sync --diff` compute what would change but write zero files. The only I/O is reading existing files to compute the diff.

## Backup guarantee

`repotune sync` always creates a backup before writing. The backup:

- Copies any file that will be modified (with original content)
- Records which files will be created (so rollback can delete them)
- Writes a `manifest.json` describing both sets

If sync is interrupted after the backup but before writing, the backup still exists and can be restored with `repotune rollback`.

## Managed block guarantee

When a file already exists with content, RepoTune uses a managed block:

```
<!-- repotune:start {agentId} -->
...generated content...
<!-- repotune:end {agentId} -->
```

Everything outside the markers is preserved byte-for-byte. RepoTune reads the current content, replaces only the content between markers, and writes the full result. It cannot accidentally destroy content outside the block.

`repotune doctor` validates only the content inside managed blocks (`checksumMode: managed-block`). Content you edit outside the block is never flagged as dirty.

## Rollback scope

`repotune rollback` operates only on files listed in the backup's `manifest.json`:

- **Restored** (`modifiedFiles`): files overwritten to their pre-sync content
- **Deleted** (`createdFiles`): files that did not exist before the sync and were created by it

It does not touch files outside those two lists.

## Reporting vulnerabilities

If you discover a security issue, please open a GitHub issue marked **[SECURITY]** or email the maintainer directly. Do not disclose publicly until a fix is available.
