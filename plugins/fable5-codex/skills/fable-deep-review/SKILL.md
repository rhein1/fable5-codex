---
name: fable-deep-review
description: Fable-5 deep code review for pull requests, branches, diffs, or proposed patches. Use when the user asks for deep review, PR review, branch review, review comments, regression review, or independent verification of a change.
---

# Fable Deep Review

Review like a senior engineer validating a change, not like a summarizer. Default to no edits unless the user asks to address findings.

For ECF-style governed runs, use `../../references/ecf-run-contract.md`. For large or high-risk reviews, use real Codex subagents when the runtime exposes a subagent tool and the user has not opted out; treat repo-wide, cross-package, security/privacy/money/data/API, migration, release, or deep-review requests as large by default. Otherwise run `single-agent multi-lens` and say why no subagents were used. For bot-parseable PR review output, use `../../templates/fable-review-contract.md`.

## Workflow

1. Identify the review target: PR, branch, diff, commit range, or files.
2. Restate authority boundaries and declare the ECF run mode: `multi-agent` only with real spawned subagents, otherwise `single-agent multi-lens`.
3. Read repo instructions and changed files completely before judging them.
4. Inspect callers, importers, tests, docs, migrations, and generated/runtime surfaces touched by the change.
5. Build a change map: intent, modified behavior, affected contracts, and risk areas.
6. Generate candidate regressions from multiple lenses:
   - API/contract compatibility
   - data/schema and migration safety
   - concurrency/idempotency/retry behavior
   - auth, privacy, and permission checks
   - user-facing/runtime behavior
   - test adequacy and missing cases
7. Verify each candidate. Prefer a small command or source trace that proves the issue.
8. Report only actionable findings. Put open questions after findings.

## Subagent Authority

Subagents may map changed files, inspect a review lens, draft candidate findings, or verify candidates. The main agent owns final severity, final findings, edits, commits, pushes, GitHub comments, and PR state changes. If a delegated review pass returns unsupported claims, report them as refuted or unknown rather than treating them as independent agreement.

## Evidence Safety

Never print raw secrets, tokens, private keys, wallet keys, credential files, or `.env` values. Redact secret-like values and cite only the file/path/key name needed to explain the issue.

## Output

Lead with findings ordered by severity. Each finding needs:

- path and line
- why the behavior is wrong or risky
- a realistic failure scenario
- evidence
- suggested correction

If no findings are found, say that clearly and list remaining test gaps or residual risk.

Include a compact `Workflow Trace` with mode, ECF contract status, lenses covered, spawned agents or no-subagent reason, verification method, and coverage gaps.

When the user asks for a review-bot-compatible result, start with exactly `LGTM` or `Needs Updates`, use the sections from `fable-review-contract.md`, and put `Workflow Trace` after the review sections.
