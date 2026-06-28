# Basic RepoTune Example

This example shows a minimal RepoTune setup with one global rule.

```bash
# From this directory:
repotune sync --dry-run
repotune sync --yes
repotune doctor
```

Files:

- `.ai/registry.json` — rules and enabled agents
- Run `repotune sync` to generate agent config files and `.ai/lock.json`
