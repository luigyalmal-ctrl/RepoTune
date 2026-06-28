# RepoTune — Build Notes v0.2.0

**Status:** Implemented  
**Version:** 0.2.0  
**Scope:** Codex, Devin, and Antigravity adapter additions on top of the v0.1.2 baseline

## Antigravity adapter status

- `IMPLEMENTED`: `antigravity` as a supported agent ID across schemas, CLI, core integration points, tests, and docs
- `IMPLEMENTED`: global rule generation to `.agents/AGENTS.md` using `<!-- repotune:start antigravity -->` / `<!-- repotune:end antigravity -->`
- `UNSUPPORTED`: arbitrary glob-based Antigravity path rules

## Verified Antigravity behavior

- Official Antigravity configuration uses `.agents/AGENTS.md` for project-scoped rules.
- Global rules can be set at `~/.gemini/config/AGENTS.md`.
- DeepMind officially confirmed there is no native support for path-scoped rules or frontmatter activation.

## Codex adapter status

- `IMPLEMENTED`: `codex` as a supported agent ID across schemas, CLI, core integration points, tests, and docs
- `IMPLEMENTED`: global rule generation to `AGENTS.md` using `<!-- repotune:start codex -->` / `<!-- repotune:end codex -->`
- `UNSUPPORTED`: arbitrary glob-based Codex path rules
- `IMPLEMENTED`: explicit overlap handling with `agents-md`

## Verified Codex behavior

- Codex reads `AGENTS.md` and `AGENTS.override.md`
- Codex walks from project root to the current working directory and loads at most one instruction file per directory
- Codex can also read configured fallback filenames from `project_doc_fallback_filenames`
- Codex supports project `.codex/config.toml` files, but RepoTune does not need to generate one for baseline rule sync

## Devin adapter status

- `IMPLEMENTED`: `devin` as a supported agent ID across schemas, CLI, core integration points, tests, and docs
- `IMPLEMENTED`: global rule generation to `AGENTS.md` using `<!-- repotune:start devin -->` / `<!-- repotune:end devin -->`
- `UNSUPPORTED`: arbitrary glob-based Devin path rules
- `IMPLEMENTED`: explicit overlap handling with `agents-md` and `codex`

## Verified Devin behavior

- Devin reads `AGENTS.md`, `AGENT.md`, and `CLAUDE.md` as project rules
- `AGENTS.md` is always read and cannot be disabled
- Rules from `AGENTS.md` are always-on
- Devin can import rules from Cursor, Windsurf, and Claude Code via `read_config_from` in `.devin/config.json`
- Devin project config lives in `.devin/config.json` (committed) and `.devin/config.local.json` (gitignored local overrides)
- Devin docs do not document a native project glob-scoped rule format beyond importing from other tools

## RepoTune decisions

1. RepoTune treats Codex as an `AGENTS.md`-compatible adapter.
2. RepoTune only supports Codex global rules in v0.2.0.
3. RepoTune does not attempt to translate arbitrary glob rules into nested Codex instruction files.
4. When both `codex` and `agents-md` are enabled, RepoTune skips Codex output and emits `CODEX_AGENTS_MD_CONFLICT`.

## Codex + agents-md overlap policy

When `registry.agents` includes both `codex` and `agents-md`:

| Step | Behavior |
| --- | --- |
| Plan | Codex adapter returns zero `generatedFiles` and warning `CODEX_AGENTS_MD_CONFLICT` |
| Apply | `agents-md` writes `AGENTS.md`; Codex block is never emitted |
| Lock | Only `agents-md` entries are recorded; no false Codex lock row |
| Dry-run | Warning is shown; zero files written |
| Doctor | Codex shows ✓ "AGENTS.md owned by agents-md (Codex reads generated file)"; exit 0 |
| Runtime | OpenAI Codex reads the RepoTune-generated `AGENTS.md` — separate Codex markers are not required |

Rationale: Codex and the `agents-md` adapter both target the same file. Duplicate managed blocks would confuse checksum validation and create conflicting ownership. Because Codex loads project instructions from `AGENTS.md` at runtime, skipping Codex output while `agents-md` owns the file is safe and intentional.
5. RepoTune treats Devin as an `AGENTS.md`-compatible adapter.
6. RepoTune only supports Devin global rules in v0.2.0.
7. RepoTune does not generate `.devin/config.json` in v0.2.0 because safe project-level defaults cannot be defined without touching user preferences, permissions, or imports.
8. When `devin` is enabled alongside `agents-md` or `codex`, RepoTune skips Devin output and emits `DEVIN_AGENTS_MD_CONFLICT`.

## Documentation debt

- A future spec is still needed before RepoTune can safely map Codex path rules to nested directories.
- If OpenAI later documents a native glob-scoped Codex rule format, the Codex adapter should be revisited.
- A future spec is needed before RepoTune can generate `.devin/config.json` safely.
- If Devin documents a native project glob-scoped rule format, the Devin adapter should be revisited.
