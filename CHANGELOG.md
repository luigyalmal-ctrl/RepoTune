# Changelog

All notable changes to RepoTune are documented in this file.

## 0.2.0

- Added first-class `codex` agent support with `repotune sync --agent codex`
- Added `@repotune/adapter-codex`
- Codex global rules now render into `AGENTS.md` with a Codex-specific managed block
- Codex path-scoped rules now emit `CODEX_PATH_SCOPE_NOT_SUPPORTED` instead of generating inaccurate nested files
- RepoTune now warns and skips Codex output when `agents-md` is also enabled, preventing duplicate `AGENTS.md` blocks
- Codex + agents-md overlap: `agents-md` owns `AGENTS.md`, Codex reads the generated file, no false Codex lock entry, and `doctor` reports Codex as intentionally skipped (exit 0)
- Added first-class `devin` agent support with `repotune sync --agent devin`
- Added `@repotune/adapter-devin`
- Devin global rules now render into `AGENTS.md` with a Devin-specific managed block
- Devin path-scoped rules now emit `DEVIN_PATH_SCOPE_NOT_SUPPORTED` because Devin has no native project glob-scoped rule format
- RepoTune now warns and skips Devin output when `agents-md` or `codex` is also enabled, preventing duplicate `AGENTS.md` blocks
- Added first-class `antigravity` agent support with `repotune sync --agent antigravity`
- Added `@repotune/adapter-antigravity`
- Antigravity global rules now render into `.agents/AGENTS.md` with an Antigravity-specific managed block
- Antigravity path-scoped rules now emit `ANTIGRAVITY_PATH_SCOPE_NOT_SUPPORTED` because Antigravity has no native project glob-scoped rule format
- Updated CLI, integration tests, and docs for Codex, Devin, and Antigravity support

### Documentation status

- `IMPLEMENTED`: Codex global rule sync
- `PARTIAL`: Codex compatibility with nested instructions is documented, but RepoTune does not yet map arbitrary glob rules into nested files
- `PLANNED`: safe directory-mappable Codex path rule support, if a future spec defines it clearly
- `IMPLEMENTED`: Devin global rule sync
- `UNSUPPORTED`: Devin path-scoped rules in v0.2.0
- `PLANNED`: Devin `.devin/config.json` import configuration, if a future spec defines safe project-level defaults
- `IMPLEMENTED`: Antigravity global rule sync
- `UNSUPPORTED`: Antigravity path-scoped rules in v0.2.0

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
