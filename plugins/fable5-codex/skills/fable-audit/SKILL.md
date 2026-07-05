---
name: fable-audit
description: Evidence-first codebase audit for correctness, security, privacy, data, integration, operational, test, and docs-vs-reality risks. Use when the user asks for a Fable-5 audit, exhaustive audit, bug hunt, risk review, codebase audit, security/integration audit, or asks Codex to find issues before changing code.
---

# Fable Audit

Run an evidence-first audit. Default to read-only unless the user explicitly asks for fixes.

## Workflow

1. Restate scope, focus, and any authority boundaries.
2. Read repo instructions before source files. Follow stricter local policy.
3. Map the target: entrypoints, public APIs, data stores, config, tests, docs, deployment hooks, and callers/importers.
4. Run independent lenses:
   - correctness and edge cases
   - integration wiring and call contracts
   - security, privacy, and authz/authn
   - data consistency, persistence, idempotency, and migrations
   - operational behavior, startup, observability, and fail-closed paths
   - test coverage and docs-vs-reality
5. Create candidate findings with a concrete failure scenario and exact evidence.
6. Verify each candidate before reporting it. Try to reproduce, refute, or bound it with source reads and commands.
7. Preserve rejected or uncertain candidates in a short "Not Reported" or "Unknowns" section when they materially affect confidence.
8. Report findings first, ordered by severity. Keep summary secondary.

Use subagents only when available and useful. Do not claim independent review happened unless it did.

## Finding Format

For each finding include:

- severity
- title
- file and line reference
- concrete failure scenario
- evidence from source, tests, commands, or runtime probes
- suggested fix or safest next step

Use clickable local file links in final answers when possible.

## Validation

Run the narrowest meaningful checks for the audited area. If a check cannot run, report the blocker exactly and distinguish tool failure from target failure.

