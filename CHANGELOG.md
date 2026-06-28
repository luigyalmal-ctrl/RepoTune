# Changelog

All notable changes to RepoTune are documented in this file.

## 0.2.0

### Added

- Added Codex adapter support through `AGENTS.md`.
- Added Devin adapter support through `AGENTS.md`.
- Added Antigravity adapter support through `.agents/rules/repotune.md`.
- Added `@repotune/adapter-codex`, `@repotune/adapter-devin`, and `@repotune/adapter-antigravity`.
- First-class CLI support: `repotune init --agents antigravity`, `repotune sync --agent antigravity`, and interactive init choice for Google Antigravity.

### Changed

- Documented shared `AGENTS.md` ownership behavior for Codex, Devin, and `agents-md`.
- Improved `doctor` output for Codex and Devin when intentionally satisfied by another `AGENTS.md` owner (exit 0, clear message).
- Codex + agents-md overlap: `agents-md` owns `AGENTS.md`, Codex reads the generated file, no false Codex lock entry.

### Fixed

- Corrected Antigravity output path from `.agents/AGENTS.md` to `.agents/rules/repotune.md` to match [official Antigravity rules documentation](https://antigravity.google/docs/rules-workflows).
- Added Antigravity to CLI init choices and `--agents` help text.
- Devin `doctor` no longer reports "not synced yet" when Devin is intentionally skipped due to `AGENTS.md` overlap.

### Documentation status

- `IMPLEMENTED`: Codex global rule sync
- `PARTIAL`: Codex nested instructions documented; RepoTune does not map arbitrary glob rules into nested files
- `IMPLEMENTED`: Devin global rule sync
- `UNSUPPORTED`: Devin path-scoped rules in v0.2.0
- `IMPLEMENTED`: Antigravity global rule sync to `.agents/rules/repotune.md`
- `UNSUPPORTED`: Antigravity path-rule mapping and workflows in v0.2.0

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
- **Claude path rules compatibility** — Claude path-scoped rules now emit both `paths:` array and `globs:` scalar frontmatter for compatibility between current official docs and prior runtime behavior. Path patterns are serialized with `JSON.stringify()`.
- **Copilot and Cursor path pattern escaping** — Path patterns are now safely serialized in generated frontmatter.
