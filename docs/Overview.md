# RepoTune — Project Overview

## 1. Executive Summary
RepoTune is an open-source CLI and repository configuration system designed to help development teams prepare, parameterize, and maintain AI-assisted software projects from a single source of truth.

Modern software repositories are increasingly used by multiple AI coding agents and development assistants, including Claude Code, GitHub Copilot, Cursor, Codex-like agents, JetBrains AI tools, Windsurf, Devin, and future agent environments.

Each of these tools has its own way of reading project instructions, rules, context files, commands, skills, plugins, and configuration.

As a result, teams often duplicate the same rules across several files, manually adapt instructions for each tool, and spend unnecessary time re-explaining how the project should be handled.

RepoTune solves this by allowing a repository to define its AI-related configuration once and safely synchronize it across multiple agent environments.

The long-term purpose of RepoTune is simple:

Configure the repository once. Keep every AI assistant aligned.

RepoTune starts with centralized repository rules and expands toward a broader system for managing reusable project presets, skills, commands, plugins, MCP configurations, hooks, policies, and AI-specific development conventions.

## 2. Product Vision
RepoTune aims to become the standard way to prepare a code repository for reliable AI-assisted development.

The goal is not merely to “connect” agents to each other.

The goal is to make a repository self-describing, reusable, and ready for work across different AI environments.

RepoTune helps teams answer questions such as:
* What rules should AI agents follow in this repository?
* Which project conventions must always be respected?
* Which files should each agent read?
* Which rules apply globally and which apply only to specific paths?
* How can the same rule be made available to Claude, Cursor, GitHub Copilot, AGENTS.md, and future tools?
* How can the repository remain safe when tools generate or modify configuration files?
* How can teams onboard new AI assistants without manually configuring the same context again?

RepoTune is designed around one core idea:

The repository should contain a single canonical AI configuration layer, and RepoTune should translate that layer into the formats required by each supported agent.

## 3. Problem Statement
AI development tools are powerful, but their configuration ecosystems are fragmented.

Each agent or assistant may rely on different mechanisms:
* Repository-level instruction files.
* Agent-specific rule folders.
* Path-scoped instruction files.
* Markdown-based memories.
* Custom commands.
* Tool-specific prompts.
* MCP server configuration.
* Project profiles.
* Local or global settings.
* Vendor-specific plugin formats.

This creates several operational problems.

### 3.1 Repeated Configuration Work
Teams often need to tell each agent the same things:
* Use pnpm, not npm.
* Never edit old migrations.
* Follow the existing architecture.
* Run tests before completing a task.
* Use Vitest, not Jest.
* Do not touch production configuration.
* Follow the repository’s naming conventions.
* Respect generated files.

Without RepoTune, these instructions must be manually copied or rewritten for each agent.

### 3.2 Inconsistent Agent Behavior
When rules are duplicated manually, they drift over time.

One agent may know that the project uses pnpm, while another may still suggest npm.

One tool may know where tests live, while another may not.

One assistant may follow a migration policy, while another may break it.

RepoTune reduces this inconsistency by keeping rules centralized and regenerating agent-specific outputs.

### 3.3 Token and Context Waste
Users often spend tokens repeatedly explaining the same project context to different agents.

RepoTune reduces this waste by making the repository itself carry the right instructions in the right files for each tool.

### 3.4 Harder Agent Experimentation
Trying a new AI coding assistant can be expensive in setup time.

The user has to figure out where that agent expects rules, what format it uses, and how to port existing conventions.

RepoTune makes agent experimentation easier by allowing existing repository rules and capabilities to be synchronized to new supported agents.

### 3.5 Risk of Breaking Existing Files
AI-related configuration files often contain manual content written by developers. A tool that overwrites those files can cause damage.

RepoTune is designed to preserve manual content through managed blocks, backups, diffs, rollback, and safe write semantics.

## 4. RepoTune’s Core Concept
RepoTune uses a canonical configuration layer inside the repository.

The repository contains one central folder:
`.ai/├── rules/├── registry.json├── lock.json├── state.local.json└── .backups/`

This folder acts as the repository’s AI configuration source of truth.

RepoTune reads the canonical configuration and generates the files required by each supported AI agent.

Conceptually:
`.ai/ source of truth
        ↓
RepoTune core
        ↓
Agent adapters
        ↓
Claude Code / GitHub Copilot / Cursor / AGENTS.md / future agents`

The user does not need to know every agent-specific configuration format. RepoTune handles the translation.

## 5. Product Scope
RepoTune is not only a rule synchronizer. Its long-term scope is broader.

RepoTune is intended to manage repository-level AI capabilities such as:
* Rules.
* Skills.
* Commands.
* Prompts.
* Plugins.
* MCP configurations.
* Hooks.
* Policies.
* Profiles.
* Agent adapters.
* Reusable project presets.

The initial implementation focuses on rule synchronization because rules are the clearest, most common, and safest foundation.

The broader product vision builds on that same architecture.

## 6. Core Entities

### 6.1 Rules
Rules are persistent repository instructions.

Examples:
* Use pnpm, never npm.
* Do not modify existing database migrations.
* Use Vitest for all tests.
* Run the test suite before marking a task complete.
* Preserve manual content outside managed blocks.

Rules can be global or scoped.

Initial rule scopes:
* global: applies to the whole repository.
* path: applies to a specific file path or glob pattern.

Future rule scopes may include:
* language.
* framework.
* agent.

Rules are the first and most important entity in RepoTune.

### 6.2 Skills
Skills are reusable workflows or task-specific capabilities.

Examples:
* Review a pull request.
* Fix failing CI checks.
* Generate a financial report.
* Create a Supabase migration.
* Audit a repository for security issues.
* Prepare a release summary.

In the long-term vision, RepoTune should allow skills to be installed once and exposed to multiple agents through native support or generated compatibility layers.

A skill may contain:
* Instructions.
* References.
* Assets.
* Scripts.
* Agent-specific metadata.
* Installation logic.
* Compatibility declarations.

RepoTune should preserve official skill behavior where available and generate safe adaptations only when needed.

### 6.3 Commands
Commands are reusable actions that can be invoked by a user or an agent.

Examples:
* /fix-ci
* /review-pr
* /create-migration
* /generate-tests
* /explain-architecture
* /prepare-release

Some agents support commands natively. Others may require commands to be represented as prompts, rules, or markdown instructions.

RepoTune’s role is to keep commands centralized and generate the correct representation for each supported environment.

### 6.4 Prompts
Prompts are reusable instruction templates.

Examples:
* Summarize this pull request.
* Explain this error.
* Generate a test plan.
* Convert notes into tasks.
* Create a technical specification.

Prompts are lighter than skills. They do not necessarily require assets, scripts, or complex workflows.

RepoTune should eventually allow teams to store prompt libraries in the repository and expose them consistently across agent environments.

### 6.5 Plugins
In RepoTune, a plugin means an external capability or integration, not RepoTune itself.

Examples:
* GitHub.
* Supabase.
* BigQuery.
* QuickBooks.
* Gmail.
* Google Drive.
* Linear.
* Jira.
* Filesystem access.

RepoTune may eventually manage plugin requirements, configuration hints, and compatibility with agents that can use those integrations.

### 6.6 MCP Configurations
MCP configurations describe external tool servers or context providers used by agents.

Examples:
* Filesystem MCP.
* GitHub MCP.
* Database MCP.
* Supabase MCP.
* Browser MCP.

RepoTune may eventually manage MCP configuration in a repository-aware way, making it easier to keep agent tooling consistent.

### 6.7 Policies
Policies are stronger than rules.

A rule guides agent behavior. A policy represents a stricter constraint.

Examples:
* Never push directly to main.
* Never delete migrations.
* Never expose secrets.
* Never run destructive commands without explicit approval.
* Never modify production credentials.

Some policies can only be expressed as instructions. Others may require hooks, permissions, or external enforcement.

RepoTune should keep the distinction clear:
* Rule = behavioral guidance.
* Policy = stronger restriction or safety requirement.
* Hook = technical enforcement mechanism.

### 6.8 Hooks
Hooks are executable checks or actions tied to events.

Examples:
* Run tests before completion.
* Block dangerous commands.
* Detect secrets before commit.
* Validate generated files.
* Prevent edits to protected paths.

Hooks are outside the initial implementation, but they are an important future layer because not every safety requirement should depend only on model instruction-following.

### 6.9 Profiles
Profiles are reusable sets of rules, skills, commands, policies, and configuration for a specific type of project.

Examples:
* React + Supabase.
* Node API.
* Python data project.
* E-commerce operations.
* Financial reporting.
* GitHub PR workflow.
* QuickBooks + BigQuery integration.

Profiles would allow a user to initialize a repository with a recommended AI configuration package.

Example future command:
`repotune init --profile react-supabase`

### 6.10 Agent Adapters
Adapters translate RepoTune’s canonical configuration into agent-specific outputs.

An adapter knows:
* Where an agent expects rules.
* Which file formats the agent supports.
* Whether path-scoped rules are supported.
* Whether managed blocks are appropriate.
* Whether the agent supports imports, symlinks, or generated files.
* Which scopes are unsupported.
* Which warnings should be returned.

Adapters are intentionally isolated so that new agents can be added without rewriting the core system.

## 7. Supported Agent Model
RepoTune treats each AI assistant as a target environment with its own capabilities.

The system should be honest about compatibility.

RepoTune should classify support levels as:
* Native — the agent supports the capability directly.
* Official — the original package includes support for that agent.
* Generated — RepoTune generated a compatible representation.
* Partial — only part of the capability can be represented.
* Unsupported — no reliable representation exists.

This prevents RepoTune from overpromising.

For example, a future skill may be fully native in one agent, partially represented as markdown rules in another, and unsupported in a third.

## 8. Safety Principles
RepoTune is designed to modify repository files, so safety is a first-class requirement.

### 8.1 Preserve Manual Content
RepoTune must never destroy manual content in shared files.

When RepoTune needs to write inside an existing file, it uses managed blocks.

Example:
`<!-- repotune:start claude -->
Generated content here.
<!-- repotune:end claude -->`

RepoTune only modifies the content inside the markers. Everything outside the block must remain byte-identical.

### 8.2 Use Backups Before Sync
Before applying generated changes, RepoTune creates a backup of files that will be modified.

The backup manifest tracks:
* Files that existed and were modified.
* Files that did not exist and were created.

Rollback must restore modified files and delete files created by the sync operation.

### 8.3 Show Diffs Before Writing
RepoTune should support dry-run and diff workflows.

Users should be able to preview what would change before applying changes.

### 8.4 Avoid Unsafe Overwrites
RepoTune should not overwrite files it does not control.

If a generated path already exists but is not tracked in RepoTune’s lockfile, RepoTune should warn and avoid overwriting the file.

This protects user-created files from accidental replacement.

### 8.5 Track Generated State
RepoTune uses a lockfile to track generated outputs.

This helps:
* Detect dirty state.
* Validate sync status.
* Support doctor checks.
* Improve reproducibility.
* Avoid overwriting unmanaged files.

### 8.6 Local State Must Stay Local
Some files should not be committed.

Examples:
* .ai/.backups/
* .ai/state.local.json

These files are local and environment-specific.

The canonical repository state should live in committed files such as:
* .ai/registry.json
* .ai/lock.json

## 9. Repository Source of Truth
RepoTune uses `.ai/` as the canonical AI configuration folder.

### 9.1 Registry
`registry.json` stores the canonical configuration.

It may include:
* Enabled agents.
* Rules.
* Future skills.
* Future commands.
* Future profiles.
* Future plugin references.

### 9.2 Lockfile
`lock.json` stores reproducible sync state.

It records:
* Generated files.
* Checksums.
* Rule IDs contributing to each file.
* Agent IDs.
* Sync timestamps.
* Checksum modes.

### 9.3 Local State
`state.local.json` stores local operational state.

Examples:
* Last backup path.
* Last sync time.

This file should be gitignored.

### 9.4 Backups
`.ai/.backups/` stores local backups created before sync operations.

This folder should be gitignored.

## 10. Current Implementation Focus
RepoTune’s first implementation focuses on rule synchronization.

The current implementation target is:
* RepoTune v0.1.2
* Scope: Rule sync for Claude Code, GitHub Copilot, Cursor, and AGENTS.md

The initial commands are:
* repotune init
* repotune rule add
* repotune rule list
* repotune sync
* repotune doctor
* repotune rollback

This first version proves the foundation:
* Central source of truth.
* Adapter-based generation.
* Managed blocks.
* Dry-run.
* Diff.
* Backup.
* Rollback.
* Lockfile.
* Dirty-state checks.
* Deterministic output.
* Safe writes.

The MVP is intentionally narrow, but the architecture is designed to support the larger product vision.

## 11. Initial Agents

### 11.1 Claude Code
RepoTune generates:
* Global rules into CLAUDE.md.
* Path rules into .claude/rules/{ruleId}.md.

### 11.2 GitHub Copilot
RepoTune generates:
* Global rules into .github/copilot-instructions.md.
* Path rules into .github/instructions/{ruleId}.instructions.md.

### 11.3 Cursor
RepoTune generates:
* Rules into .cursor/rules/{ruleId}.mdc.

### 11.4 AGENTS.md
RepoTune generates:
* Global rules into AGENTS.md.

AGENTS.md acts as a generic target for agents or tools that read repository-level agent instructions.

## 12. Architecture Overview
RepoTune uses a modular architecture.

`packages/├── schemas/├── core/├── adapters/└── cli/`

### 12.1 Schemas
The schemas package defines all shared Zod schemas and inferred TypeScript types.

It is the source of truth for data contracts.

### 12.2 Core
The core package handles:
* Registry reading and writing.
* Lockfile reading and writing.
* Diff calculation.
* Managed block rendering.
* File writing.
* Backups.
* Rollback.
* Conflict detection.
* Path resolution.
* Sync planning and application.

All filesystem writes belong to core.

### 12.3 Adapters
Adapters translate canonical rules into agent-specific generated files.

Adapters are read-only planners. They may inspect the repository, but they do not write files.

### 12.4 CLI
The CLI handles user interaction.

It should not contain business logic. It delegates to core and adapters.

## 13. Key Design Principles

### 13.1 Local-First
RepoTune operates locally on the user’s repository.

A remote registry may exist in the future, but RepoTune should not depend on a remote service for its core functionality.

### 13.2 Open Source
RepoTune is designed as a public GitHub project.

It should be understandable, auditable, and extensible.

### 13.3 Adapter-Based Extensibility
Each agent has its own adapter.

Adding a new agent should mean adding a new adapter, not modifying the whole system.

### 13.4 No Hidden Mutation
RepoTune should be transparent about what it changes.

Generated files, diffs, backups, lockfiles, and managed blocks should make changes auditable.

### 13.5 Deterministic Output
The same rules should generate the same outputs.

Stable ordering matters for testability, reviewability, and clean Git diffs.

### 13.6 Honest Compatibility
RepoTune should clearly communicate when something is native, generated, partial, or unsupported.

### 13.7 Safety Over Convenience
RepoTune should prefer warnings, dry-runs, and safe failure over destructive writes.

## 14. Example Workflow
A user initializes RepoTune:
`repotune init`

The user chooses supported agents:
* Claude Code
* GitHub Copilot
* Cursor
* AGENTS.md

The user adds a rule:
`repotune rule add "Use pnpm, never npm."`

The user previews changes:
`repotune sync --dry-run --diff`

RepoTune shows which files would be created or updated.

The user applies the sync:
`repotune sync`

RepoTune generates agent-specific files, creates a backup, updates the lockfile, and reports the result.

If needed, the user rolls back:
`repotune rollback`

## 15. Future Capabilities
RepoTune’s roadmap should expand beyond rule synchronization while preserving the same safety model.

### 15.1 Skill Installation
RepoTune should eventually support installing skills from:
* GitHub.
* GitLab.
* NPM.
* ZIP files.
* Local folders.

A skill should be installed once and exposed to supported agents.

### 15.2 Skill Homologation
RepoTune should eventually normalize skill packages into a common representation and generate agent-specific versions.

The system should preserve original sources and distinguish between native, official, generated, partial, and unsupported support.

### 15.3 Commands
RepoTune should support reusable commands that can be translated into supported agent command systems or prompt files.

### 15.4 Profiles
RepoTune should support reusable project profiles.

Example:
`repotune init --profile react-supabase`

### 15.5 MCP Management
RepoTune may manage MCP configuration across supported agents.

### 15.6 Policies and Hooks
RepoTune may support stronger policy and hook mechanisms for safety-critical workflows.

### 15.7 Team Registries
RepoTune may eventually support team-level or organization-level registries of approved rules, skills, commands, and profiles.

### 15.8 Compatibility Reports
RepoTune should eventually provide detailed compatibility reports showing which capabilities are available in each agent.

## 16. Non-Goals
RepoTune should not try to do everything at once.

Initial non-goals include:
* Replacing AI agents.
* Acting as a hosted AI platform.
* Running AI models directly.
* Enforcing all safety policies without hooks or external mechanisms.
* Promising perfect semantic equivalence across agents.
* Installing untrusted scripts without review.
* Overwriting user files without visibility.
* Turning every rule into global context.

RepoTune should remain a configuration and synchronization layer, not a monolithic AI development platform.

## 17. Why RepoTune Matters
AI-assisted development is becoming multi-agent by default.

A single repository may be edited, reviewed, explained, tested, and refactored by several different AI tools.

Without a shared configuration layer, every tool receives fragmented context.

RepoTune gives the repository a stable AI configuration foundation.

It makes the repo easier to understand, easier to onboard, easier to test with new agents, and safer to automate.

RepoTune’s value is not only in writing files. Its value is in reducing repeated setup, preventing configuration drift, and creating a reusable AI operating layer for software projects.

## 18. Product Positioning
RepoTune can be described as:
* An open-source CLI for tuning AI-assisted repositories from a single source of truth.

Alternative descriptions:
* RepoTune centralizes project rules and synchronizes them safely across AI coding assistants.
* RepoTune helps teams configure repositories once and keep Claude Code, GitHub Copilot, Cursor, AGENTS.md, and future agents aligned.
* RepoTune is a local-first configuration layer for multi-agent software development.

## 19. Suggested Taglines
* Tune your repo once. Sync every AI assistant.
* One source of truth for AI-ready repositories.
* Reusable project presets for AI-assisted development.
* Configure once. Work everywhere.
* Make your repository ready for every coding agent.

## 20. Final Definition
RepoTune is a local-first, open-source CLI for configuring AI-assisted software repositories from a single source of truth.

It centralizes repository rules, project conventions, and eventually skills, commands, prompts, plugins, MCP configurations, policies, hooks, and profiles, then synchronizes them safely into the formats required by different AI coding agents.

Its first implementation focuses on rule synchronization for Claude Code, GitHub Copilot, Cursor, and AGENTS.md.

Its broader vision is to become the standard configuration layer for repositories that rely on multiple AI development tools.

RepoTune exists to make AI-assisted development easier, safer, more consistent, and faster to adopt across tools.