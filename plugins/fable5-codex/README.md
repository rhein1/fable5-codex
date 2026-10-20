# Fable-5 for Codex

Fable-5 verifies what a coding agent actually finished, tested and left unverified before merge. Start with `$fable-verify` in quick or deep mode; map explicit acceptance criteria to current source, observed checks, reasoned conclusions and next actions. Versioned artifacts/handoffs require revalidation and never authorize repair, merge or deploy.

The six existing workflows remain:

- `$fable-audit`: ranked bug, risk, and integration audit
- `$fable-deep-review`: PR or branch review with verification passes
- `$fable-fact-check`: claim-by-claim verification against source/runtime evidence
- `$fable-understand`: source-grounded explanation of how a system works
- `$fable-design-options`: design alternatives with tradeoffs and migration notes
- `$fable-sweep`: repo-wide change workflow with discovery, implementation, and verification

The plugin is intentionally conservative. It asks Codex to map the target, inspect callers/importers, preserve rejected candidates, cite file and command evidence, and separate target-system failures from runner/tool failures.

The optional [RRSI source experiment](experiments/rrsi/README.md) provides frozen
baseline exports, bounded candidate diff verification and offline independent
evaluation contracts. It does not change the installed workflows or launch an
optimizer; paid execution, host qualification and exact-commit promotion remain
separately gated.

## Model And Client Profiles

Profiles are centralized in `config/model-profiles.json`. Balanced/deep prefer GPT-6.1 Sol medium/max and economical work prefers GPT-6 Luna, only where the chosen client's catalog supports the model/effort. Unsupported explicit overrides fail; profile fallbacks are reported. Catalogs do not establish entitlement. See `references/model-support.md`.

Do not silently replace an active session's model or user configuration. The compatibility-named deep template must be checked against the selected client before applying it. Workflow Traces report actual model/worker execution, not merely requested settings.

## ECF Run Contracts

The plugin includes `references/ecf-run-contract.md` and `templates/fable-ecf-run-contract.json`. These files define the governance layer for a run: scope, authority, lenses, delegation policy, evidence policy, verification policy, and final receipt fields.

The ECF contract does not spawn subagents by itself. It records the intended workflow and the final trace. Real Codex subagents are used for large or high-risk Fable tasks when the active runtime exposes a subagent tool and the user has not opted out. Workers request Luna medium explicitly when supported; the trace records requested and actual coordinator and worker profiles plus any fallback.

Subagent authority is intentionally narrow. Subagents may research, map, plan, draft, find candidate issues, or verify assigned candidates. The main agent owns spot-checking, final findings, edits, commits, pushes, GitHub comments, deploys, publishing, credential mutation, and money/wallet actions.

For PR review bots or review-loop artifacts, use `templates/fable-review-contract.md` so `LGTM` / `Needs Updates` verdicts and blocking sections stay machine-readable.

## Subagents

Codex subagents are automatic for large or high-risk Fable tasks when the runtime exposes a subagent tool and the user has not opted out. The `$fable-audit` skill still runs a visible multi-lens workflow every time; when subagents are unavailable or the task is small/routine, it reports `single-agent multi-lens` instead of implying independent parallel review.

Large/high-risk means repo-wide or cross-package work, exhaustive audit, deep review, broad sweep, migration, launch readiness, "find every place", or anything touching money, auth, privacy, secrets, data migrations, public APIs, serialized contracts, deploys, or production operations.

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
bash ./scripts/fable5-codex.sh audit src "correctness and integration"
```

Bash with ECF contract and explicit subagent authorization:

```bash
bash ./scripts/fable5-codex.sh audit src "correctness, security, data, operations, tests, and docs-vs-reality" --subagents
```

Wrappers default to read-only verification and the balanced profile. PowerShell adds `-Profile balanced|deep|economical` and `-VerificationDepth quick|deep`; Bash adds `--profile=` and `--depth=`. Existing model/worker/executable overrides remain. `-DryRun`/`--dry-run` display preferences without catalog/inference access claims. Verification rejects the write flag; request a separate scoped repair workflow. See `references/completion-verification.md` for artifact/API examples and privacy limits.
