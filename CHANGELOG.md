# Changelog

All notable changes to RepoTune are documented in this file.

## 0.1.2

Initial MVP release.

- `init`, `rule add`, `rule list`, `sync`, `doctor`, and `rollback` commands
- Adapters for Claude Code, GitHub Copilot, Cursor, and AGENTS.md
- Managed blocks for preserving manual content in global files
- Backup manifest and rollback support
- Conflict detection blocks sync
- Lockfile tracks generated files with checksum validation

### Technical adjustments (vs build spec v0.1.2 draft)

- **`Warning.path`** — optional repo-relative output path on `Warning`. Not in the original spec (`code`, `message`, `agentId`, `ruleId` only). Used to identify skipped files in sync output and lock/backup logic without parsing `message`.
- **Cursor `CURSOR_MISSING_PATH_PATTERN`** — defensive warning when a path-scoped rule has no `pathPattern` (mirrors Copilot adapter behavior).
