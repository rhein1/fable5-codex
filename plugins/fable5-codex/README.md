# Fable-5 for Codex

Fable-5 for Codex is a local Codex plugin that packages evidence-first workflows as six reusable skills:

- `$fable-audit`: ranked bug, risk, and integration audit
- `$fable-deep-review`: PR or branch review with verification passes
- `$fable-fact-check`: claim-by-claim verification against source/runtime evidence
- `$fable-understand`: source-grounded explanation of how a system works
- `$fable-design-options`: design alternatives with tradeoffs and migration notes
- `$fable-sweep`: repo-wide change workflow with discovery, implementation, and verification

The plugin is intentionally conservative. It asks Codex to map the target, inspect callers/importers, preserve rejected candidates, cite file and command evidence, and separate target-system failures from runner/tool failures.

## Example Prompts

```text
Use $fable-understand. Question: how does this repo boot? Include citations and unknowns.
```

```text
Use $fable-audit. Scope: src/billing. Focus: money math, idempotency, integration wiring, and docs-vs-reality.
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

Bash:

```bash
./scripts/fable5-codex.sh audit src "correctness and integration"
```

The wrappers call `codex exec` in read-only mode by default. Pass the write flag only for controlled edits.

