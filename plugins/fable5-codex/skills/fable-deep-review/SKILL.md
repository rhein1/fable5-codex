---
name: fable-deep-review
description: Fable-5 deep code review for pull requests, branches, diffs, or proposed patches. Use when the user asks for deep review, PR review, branch review, review comments, regression review, or independent verification of a change.
---

# Fable Deep Review

Review like a senior engineer validating a change, not like a summarizer. Default to no edits unless the user asks to address findings.

## Workflow

1. Identify the review target: PR, branch, diff, commit range, or files.
2. Read repo instructions and changed files completely before judging them.
3. Inspect callers, importers, tests, docs, migrations, and generated/runtime surfaces touched by the change.
4. Build a change map: intent, modified behavior, affected contracts, and risk areas.
5. Generate candidate regressions from multiple lenses:
   - API/contract compatibility
   - data/schema and migration safety
   - concurrency/idempotency/retry behavior
   - auth, privacy, and permission checks
   - user-facing/runtime behavior
   - test adequacy and missing cases
6. Verify each candidate. Prefer a small command or source trace that proves the issue.
7. Report only actionable findings. Put open questions after findings.

## Output

Lead with findings ordered by severity. Each finding needs:

- path and line
- why the behavior is wrong or risky
- a realistic failure scenario
- evidence
- suggested correction

If no findings are found, say that clearly and list remaining test gaps or residual risk.

