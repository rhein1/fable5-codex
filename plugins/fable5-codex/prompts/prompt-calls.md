# Fable-5 Prompt Calls

```text
Use $fable-understand. Question: how does this repo boot? Include citations and unknowns.
```

```text
Use $fable-audit with real Codex subagents and an ECF run contract. I explicitly authorize parallel subagents for this run. Scope: server/routes. Focus: authz, trust-state mutation, money flow, and docs-vs-reality. Spawn four independent read-only lenses on GPT-5.6 Luna with medium reasoning: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The Sol Ultra coordinator must verify candidates locally before final findings. Do not claim multi-agent mode or Luna use unless runtime-visible evidence supports it. Include the ECF contract and Workflow Trace.
```

```text
Use $fable-deep-review. Review the current branch against origin/main. Findings first, with file and line evidence.
```

```text
Use $fable-deep-review with an ECF run contract and review-bot-compatible output. Review the current branch against origin/main. Start with LGTM or Needs Updates, use the Fable review contract sections, and include Workflow Trace.
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

## Indexed development recipes

Use the [development index](development-index.md) to select one recipe or a
suggested playbook. Read the [shared contract](../references/development-playbooks.md)
first. These are original Fable adaptations with source provenance, not an import
of every GitLab prompt. They reuse the existing six skills and authority rules.

```text
Use $fable-sweep with the finish-existing playbook from the development prompt index. Scope: the feature I identify. Inspect the existing code and current PRs first. Load one recipe at a time, complete only the authorized vertical slice, and finish with completion-proof. Preserve current model, worker, and ECF settings.
```

```text
Use $fable-understand with the pipeline-triage recipe. Inspect the failing job at its exact SHA, distinguish code from runner failures, and return a minimal repair plan. Do not weaken any gate or perform external actions.
```

The bundled `scripts/development-prompts.mjs` selector supports `search`, `show`,
and `playbook`; it prints guidance and never executes Codex or grants permissions.
