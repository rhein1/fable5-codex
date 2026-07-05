# Report Schema

The JSON schema lives at:

```text
plugins/fable5-codex/schemas/fable5.schema.json
```

It models:

- run metadata
- findings
- judge votes
- evidence
- coverage areas
- rejected candidates
- unknowns

Use the schema for durable ledgers, CI artifacts, and dashboard ingestion. Markdown reports remain useful for humans, but the structured ledger is the part that makes Fable-5 repeatable.

