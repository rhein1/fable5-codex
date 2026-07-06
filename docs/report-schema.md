# Report Schema

The JSON schema lives at:

```text
plugins/fable5-codex/schemas/fable5.schema.json
```

It models:

- run metadata
- workflow trace
- ECF run contract
- findings
- judge votes
- evidence
- coverage areas
- rejected candidates
- unknowns

Use the schema for durable ledgers, CI artifacts, and dashboard ingestion. Markdown reports remain useful for humans, but the structured ledger is the part that makes Fable-5 repeatable.

The ECF run contract fields are optional for backward compatibility. New governed runs should include:

- `workflowTrace`: final execution mode, ECF contract status, lenses covered, spawned agents or no-subagent reason, verification method, and coverage gaps
- `ecfRunContract`: contract version, authority, scope, required lenses, delegation policy, evidence policy, verification policy, and receipt fields
