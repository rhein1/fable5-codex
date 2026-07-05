# Prompt Calls

```text
Use $fable-understand. Scope: this repository. Question: what files define the Fable-5 Codex plugin, and what are the six installed skills? Include file citations and an UNKNOWNS section.
```

```text
Use $fable-fact-check. Doc: README.md. Verify every claim about installed files, supported skills, wrapper scripts, and schema files against the actual files on disk.
```

```text
Use $fable-audit. Scope: plugins/fable5-codex. Focus: Codex plugin compatibility, path assumptions, Windows compatibility, overbroad promises, missing install steps, and schema/reporting gaps.
```

```text
Use $fable-sweep. Task: rename FooPaymentAttempt to InvoiceAttempt everywhere in evals/sweep-fixture. First show the complete discovered file list and categories. Then make the edits. Then run an independent checker pass.
```

