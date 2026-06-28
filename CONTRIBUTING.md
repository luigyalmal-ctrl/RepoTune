# Contributing to RepoTune

## Setup

```bash
git clone https://github.com/your-org/repotune
cd repotune
pnpm install
pnpm -r build
pnpm -r test
```

Requires Node.js >= 20 and pnpm.

## Project structure

```
packages/
├── schemas/         Zod schemas and TypeScript types — @repotune/schemas
├── core/            Filesystem logic, sync/diff/backup engine — @repotune/core
├── adapters/
│   ├── claude/      Claude Code adapter — @repotune/adapter-claude
│   ├── copilot/     GitHub Copilot adapter — @repotune/adapter-copilot
│   ├── cursor/      Cursor adapter — @repotune/adapter-cursor
│   └── agents-md/   AGENTS.md adapter — @repotune/adapter-agents-md
└── cli/             Commander CLI — @repotune/cli
tests/
├── fixtures/        Static repo fixtures for integration tests
└── integration/     End-to-end tests using real tmp directories
```

## How to add an agent adapter

1. Create `packages/adapters/{id}/src/index.ts`
2. Implement `AgentAdapter` from `@repotune/schemas`:

```typescript
import type { AgentAdapter } from '@repotune/schemas';

export const myAdapter: AgentAdapter = {
  agentId: 'my-agent',
  capabilities: { ... },

  async plan(rules, repoRoot) {
    // Read-only. May read existing files to choose strategy.
    // Must not write files. Must not throw.
    // Return { generatedFiles, warnings }.
  },

  async validate({ repoRoot, lockFile }) {
    // Validate config state. Does not modify files.
    // Return Warning[].
  },
};
```

3. Add `packages/adapters/{id}/package.json` (name: `@repotune/adapter-{id}`)
4. Add the adapter to `@repotune/cli/src/commands/sync.ts` and `doctor.ts`
5. Register the AgentId in `AgentIdSchema` in `@repotune/schemas`
6. Add unit tests covering all plan() behaviors and validate()
7. Add integration tests for the output file format

### Rules for adapters

- `plan()` is a **read-only planner** — it may read existing target files to choose between `create` and `managed-block` strategy, but must never write, delete, or create directories
- Return a `Warning` for unsupported rule scopes instead of throwing
- The `ManagedBlockRenderer` in `@repotune/core` handles all block injection — do not reimplement it
- All paths in `GeneratedFile.outputPath` must be repo-relative with `/` separator

## Tests

Unit tests live alongside source (or in `tests/` subdirectory). Integration tests live in `tests/integration/`.

All tests use real filesystems. No `fs` mocks. Each test creates a tmp directory and removes it on cleanup.

```bash
pnpm --filter @repotune/core test        # unit tests
pnpm --filter @repotune/integration-tests test  # integration tests
pnpm -r test                             # all tests
```

## Code style

Linted and formatted with Biome. Run before committing:

```bash
pnpm biome check --write .
```

No `any` types. Strict TypeScript. All data model types are derived with `z.infer<>` from Zod schemas — no standalone interfaces for data models.

## Pull requests

- One feature or fix per PR
- Tests required for new behavior
- `pnpm -r build && pnpm -r test` must pass
