# Fable Understand Sample: Boot Flow

Use case:

```text
Use $fable-understand. Scope: this repository. Question: what files define the Fable-5 Codex plugin and how does installation work? Include citations, coverage notes, rejected candidates, and unknowns.
```

## Answer

The plugin package is defined by `plugins/fable5-codex/.codex-plugin/plugin.json`. That manifest points Codex at `./skills/`, exposes plugin UI metadata, and lists plugin screenshots.

The repo-local marketplace is defined by `.agents/plugins/marketplace.json`. Its `source.path` is `./plugins/fable5-codex`, which keeps the checkout portable because Codex resolves the path from the marketplace root.

The npm/GitHub installer is `bin/install.mjs`. It copies the plugin into a personal or project-local plugin folder, writes or updates `.agents/plugins/marketplace.json`, and optionally runs `codex plugin add`.

## Rejected Candidates

- `examples/` demonstrates prompts and sample repositories, but it is not the installed plugin.
- `benchmarks/` measures workflow output, but it is not needed for runtime plugin discovery.

## Unknowns

- Codex app UI discovery still requires a fresh installed app session.
- Subagent availability depends on the active Codex runtime and user authorization.

## Workflow Trace

- mode: single-agent multi-lens
- ECF contract: not emitted
- subagent trigger: not used
- no-subagent reason: explanation-only task
- lenses covered: package metadata, marketplace path, installer behavior, runtime caveats
- local verification: source file inspection
- coverage gaps: no live app UI screenshot
