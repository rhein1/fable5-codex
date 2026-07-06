---
name: fable-audit
description: Evidence-first codebase audit for correctness, security, privacy, data, integration, operational, test, and docs-vs-reality risks. Use when the user asks for a Fable-5 audit, exhaustive audit, bug hunt, risk review, codebase audit, security/integration audit, or asks Codex to find issues before changing code.
---

# Fable Audit

Run an evidence-first audit. Default to read-only unless the user explicitly asks for fixes.

For ECF-style governed runs, use the plugin reference at `../../references/ecf-run-contract.md` and the starter template at `../../templates/fable-ecf-run-contract.json`. The contract records scope, authority, required lenses, delegation policy, evidence policy, verification policy, and the final receipt. It does not itself spawn subagents.

## Workflow

1. Restate scope, focus, and any authority boundaries.
2. Declare the run mode: `multi-agent` only when real subagents will be spawned, otherwise `single-agent multi-lens`.
3. Declare the ECF run contract inline or as an artifact when the user asks for ECF, subagents, repeatable evidence, CI ledgers, or durable receipts.
4. Read repo instructions before source files. Follow stricter local policy.
5. Map the target: entrypoints, public APIs, data stores, config, tests, docs, deployment hooks, and callers/importers.
6. Run independent lenses:
   - correctness and edge cases
   - integration wiring and call contracts
   - security, privacy, and authz/authn
   - data consistency, persistence, idempotency, and migrations
   - operational behavior, startup, observability, and fail-closed paths
   - test coverage and docs-vs-reality
7. Create candidate findings with a concrete failure scenario and exact evidence.
8. Verify each candidate before reporting it. Try to reproduce, refute, or bound it with source reads and commands.
9. Preserve rejected or uncertain candidates in a short "Not Reported" or "Unknowns" section when they materially affect confidence.
10. Report findings first, ordered by severity. Keep summary secondary.

## Subagents And Workflow Visibility

Every audit must make the workflow visible. In the final report, include a short `Workflow Trace` section after findings that states:

- mode: `multi-agent` or `single-agent multi-lens`
- subagents used, their assigned lenses, or the concrete reason no subagents were used
- lenses covered
- verification method
- coverage gaps and unknowns

Codex subagents are allowed only when the user explicitly asks for subagents, delegation, or parallel agent work and a subagent tool is available. If that condition is met, use this orchestration pattern unless the scope is too small to justify it:

1. Keep the main agent as orchestrator and synthesizer.
2. Do the initial scope/read-order check locally so delegated work is well bounded.
3. Declare an ECF-style contract with `mode: multi-agent`, the quoted authorization phrase, authority boundaries, and the planned lenses.
4. Spawn independent read-only finder subagents for disjoint lenses:
   - `correctness-integration`: correctness, edge cases, and integration contracts
   - `security-privacy-authz`: security, privacy, authn/authz, and secret handling
   - `data-migrations-idempotency`: data consistency, persistence, idempotency, and migrations
   - `operations-tests-docs`: operations, startup, observability, tests, and docs-vs-reality
5. Ask each subagent for candidate findings with exact evidence, failure scenario, refutation conditions, and unknowns.
6. Record the real subagent IDs or runtime-visible handles. Do not invent IDs.
7. Verify high-impact candidates locally or with a separate verifier subagent when that can run in parallel without blocking the orchestrator.
8. Synthesize only verified findings. Keep refuted or uncertain candidates in `Not Reported` or `Unknowns` when they affect confidence.

If the user did not explicitly ask for subagents, or the runtime does not expose a subagent tool, still run the same independent lenses locally and report `single-agent multi-lens` in `Workflow Trace`. Do not claim independent review, parallel review, or subagent work happened unless it actually did.

Use this prompt shape when a user wants the full path:

```text
Use $fable-audit with real Codex subagents and an ECF run contract. I explicitly authorize parallel subagents for this run. Spawn four independent read-only lenses: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist. Include the ECF contract and Workflow Trace.
```

## Evidence Safety

Never print raw secrets, tokens, private keys, wallet keys, credential files, or `.env` values. Redact secret-like values and cite only the file/path/key name needed to explain the issue.

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
