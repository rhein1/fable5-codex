# Fable-5 Prompt Calls

```text
Use $fable-understand. Question: how does this repo boot? Include citations and unknowns.
```

```text
Use $fable-audit with real Codex subagents and an ECF run contract. I explicitly authorize parallel subagents for this run. Scope: server/routes. Focus: authz, trust-state mutation, money flow, and docs-vs-reality. Spawn four independent read-only lenses: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist. Include the ECF contract and Workflow Trace.
```

```text
Use $fable-deep-review. Review the current branch against origin/main. Findings first, with file and line evidence.
```

```text
Use $fable-fact-check. Doc: WRAPUP.md. Verify live/done/tested claims against disk and commands.
```

```text
Use $fable-design-options. Decision: how should we add versioned migrations for this table change?
```

```text
Use $fable-sweep. Task: rename OldMetricName to NewMetricName everywhere, preserving serialized compatibility where required.
```
