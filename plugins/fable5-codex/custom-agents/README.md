# Fable-5 Custom Agent Templates

These files are role templates. They are included so a repo or Codex surface that supports repo-local custom agents can copy them into `.codex/agents/`.

They are not automatically registered by the Fable-5 plugin manifest. The plugin's guaranteed runtime surface is the six skills under `skills/`.

## Roles

- `fable-explorer.toml`: maps entrypoints, call paths, tests, docs, and unknowns.
- `fable-finder.toml`: searches for candidate findings from one assigned lens.
- `fable-verifier.toml`: reproduces, refutes, or bounds candidate findings.
- `fable-synthesizer.toml`: deduplicates verified evidence and writes a findings-first report.
- `fable-fixer.toml`: implements scoped fixes for verified findings.

## Audit Usage

For Codex runtimes with generic subagent tools, ask for subagents explicitly:

```text
Use $fable-audit with subagents. Scope: src/billing. Focus: money math, idempotency, integration wiring, and docs-vs-reality.
```

If no subagent tool is available, `$fable-audit` should still run the same lenses locally and report `single-agent multi-lens` in its `Workflow Trace`.
