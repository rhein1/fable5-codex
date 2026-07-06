# Prompt Calls

```text
Use $fable-understand. Scope: this repository. Question: what files define the Fable-5 Codex plugin, and what are the six installed skills? Include file citations and an UNKNOWNS section.
```

```text
Use $fable-fact-check. Doc: README.md. Verify every claim about installed files, supported skills, wrapper scripts, and schema files against the actual files on disk.
```

```text
Use $fable-deep-review with an ECF run contract and review-bot-compatible output. Review the current branch against origin/main. Start with LGTM or Needs Updates, use the Fable review contract sections, and include Workflow Trace.
```

```text
Use $fable-audit with real Codex subagents and an ECF run contract. I explicitly authorize parallel subagents for this run. Scope: plugins/fable5-codex. Focus: Codex plugin compatibility, path assumptions, Windows compatibility, overbroad promises, missing install steps, schema/reporting gaps, and docs-vs-reality. Spawn four independent read-only lenses: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist. Include the ECF contract and Workflow Trace.
```

```text
Use $fable-sweep. Task: rename FooPaymentAttempt to InvoiceAttempt everywhere in evals/sweep-fixture. First show the complete discovered file list and categories. Then make the edits. Then run an independent checker pass.
```
