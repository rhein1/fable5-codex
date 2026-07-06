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

For Codex runtimes with generic subagent tools, ask for subagents explicitly and request an ECF run contract:

```text
Use $fable-audit with real Codex subagents and an ECF run contract. I explicitly authorize parallel subagents for this run. Scope: src/billing. Focus: money math, idempotency, integration wiring, and docs-vs-reality. Spawn four independent read-only lenses: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist. Include the ECF contract and Workflow Trace.
```

If no subagent tool is available, `$fable-audit` should still run the same lenses locally and report `single-agent multi-lens` in its `Workflow Trace`.
