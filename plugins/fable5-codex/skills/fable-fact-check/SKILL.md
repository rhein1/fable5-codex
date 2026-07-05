---
name: fable-fact-check
description: Claim-by-claim verification of docs, status reports, launch claims, changelogs, READMEs, runbooks, and "done/tested/working/live" assertions against source, tests, artifacts, and runtime evidence. Use when the user asks Codex to fact-check, verify claims, audit truthfulness, or compare docs to reality.
---

# Fable Fact Check

Verify claims against actual evidence. Do not edit claims unless the user asks for a correction pass.

## Workflow

1. Identify the document, status report, or claim set.
2. Extract checkable claims. Prioritize words like done, shipped, live, tested, working, complete, supports, secure, verified, deployed, public, and automated.
3. For each claim, find the implementing source, tests, artifacts, deployment config, or runtime surface that would make it true.
4. Classify each claim:
   - true
   - false
   - partial
   - stale
   - unverifiable
5. Cite exact evidence for every classification.
6. Separate docs/source mismatch from environment/tooling failure.
7. If asked to fix docs, patch only the claims that evidence disproves or bounds.

## Evidence Safety

Never print raw secrets, tokens, private keys, wallet keys, credential files, or `.env` values. Redact secret-like values and cite only the file/path/key name needed to explain the issue.

## Output

Use a compact table when many claims are checked:

```text
Claim | Verdict | Evidence | Correction
```

End with the highest-risk false or partial claims and the safest next verification step.
