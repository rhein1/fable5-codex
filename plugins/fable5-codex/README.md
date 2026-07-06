# Fable-5 for Codex

Fable-5 for Codex is a local Codex plugin that packages evidence-first workflows as six reusable skills plus Micro ECF-style run contracts:

- `$fable-audit`: ranked bug, risk, and integration audit
- `$fable-deep-review`: PR or branch review with verification passes
- `$fable-fact-check`: claim-by-claim verification against source/runtime evidence
- `$fable-understand`: source-grounded explanation of how a system works
- `$fable-design-options`: design alternatives with tradeoffs and migration notes
- `$fable-sweep`: repo-wide change workflow with discovery, implementation, and verification

The plugin is intentionally conservative. It asks Codex to map the target, inspect callers/importers, preserve rejected candidates, cite file and command evidence, and separate target-system failures from runner/tool failures.

## ECF Run Contracts

The plugin includes `references/ecf-run-contract.md` and `templates/fable-ecf-run-contract.json`. These files define the governance layer for a run: scope, authority, lenses, delegation policy, evidence policy, verification policy, and final receipt fields.

The ECF contract does not spawn subagents by itself. It records the intended workflow and the final trace. Real Codex subagents are used only when the user explicitly authorizes subagents and the active runtime exposes a subagent tool.

## Subagents

Codex subagents are opt-in. The `$fable-audit` skill runs a visible multi-lens workflow every time, but it only spawns subagents when the user explicitly asks for subagents, delegation, or parallel agent work and the runtime exposes a subagent tool.

Use this form when you want the multi-agent path:

```text
Use $fable-audit with real Codex subagents and an ECF run contract. I explicitly authorize parallel subagents for this run. Scope: src/billing. Focus: money math, idempotency, integration wiring, and docs-vs-reality. Spawn four independent read-only lenses: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist. Include the ECF contract and Workflow Trace.
```

The packaged `custom-agents/` files are role templates. They are not automatically loaded as named Codex subagents by the plugin manifest.

## Example Prompts

```text
Use $fable-understand. Question: how does this repo boot? Include citations and unknowns.
```

```text
Use $fable-audit with real Codex subagents and an ECF run contract. I explicitly authorize parallel subagents for this run. Scope: src/billing. Focus: money math, idempotency, integration wiring, and docs-vs-reality. Spawn four independent read-only lenses: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist. Include the ECF contract and Workflow Trace.
```

```text
Use $fable-fact-check. Doc: STATUS.md. Verify every "done", "working", and "tested" claim against disk.
```

```text
Use $fable-sweep. Task: rename CustomerPaymentAttempt to InvoiceAttempt everywhere, including docs, tests, config, and serialized strings.
```

## Local CLI Wrapper

PowerShell:

```powershell
.\scripts\fable5-codex.ps1 -Mode audit -Scope src -Focus "correctness and integration"
```

PowerShell with ECF contract and explicit subagent authorization:

```powershell
.\scripts\fable5-codex.ps1 -Mode audit -Scope src -Focus "correctness, security, data, operations, tests, and docs-vs-reality" -Subagents
```

Bash:

```bash
./scripts/fable5-codex.sh audit src "correctness and integration"
```

Bash with ECF contract and explicit subagent authorization:

```bash
./scripts/fable5-codex.sh audit src "correctness, security, data, operations, tests, and docs-vs-reality" --subagents
```

The wrappers call `codex exec` in read-only mode by default. Pass the write flag only for controlled edits. `-Subagents` / `--subagents` adds the explicit authorization phrase and requests an ECF run contract, but the report must still fall back to `single-agent multi-lens` if the active Codex runtime does not expose subagents.
