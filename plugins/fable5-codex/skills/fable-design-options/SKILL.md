---
name: fable-design-options
description: Evidence-grounded design option generation for technical architecture, migrations, APIs, data models, safety controls, operational changes, and implementation plans. Use when the user asks for options, tradeoffs, design review, migration strategy, or a decision memo grounded in the current codebase.
---

# Fable Design Options

Generate options after reading the actual system. Avoid abstract architecture advice when source evidence is available.

For ECF-style governed runs, use `../../references/ecf-run-contract.md`. For large or high-risk design-option tasks, use real Codex subagents when the runtime exposes a subagent tool and the user has not opted out; treat architecture, migration, API, data model, security/privacy/money/data/API, operational, release, or cross-module decisions as large by default. Otherwise run `single-agent multi-lens` and say why no subagents were used when workflow trace is requested.

For large or high-risk Fable tasks, recommend running the parent task on `gpt-5.6-sol` with Ultra (`model_reasoning_effort = "ultra"`) when available. Ultra may delegate proactively, but still explicitly request parallel delegation for disjoint Fable lenses when the runtime supports subagents; otherwise use `single-agent multi-lens` and report the reason.

## Workflow

1. Clarify the decision, constraints, authority boundaries, and success criteria from the prompt and repo instructions.
2. Declare the ECF run mode when the user asks for ECF, subagents, or a receipt.
3. Read the relevant implementation, callers/importers, tests, docs, and operational surfaces.
4. Identify hard constraints: public contracts, migration compatibility, security/privacy rules, performance needs, deploy boundaries, and rollback requirements.
5. Produce 2-4 viable options. Include a conservative option and a higher-leverage option when both are realistic.
6. For each option, state:
   - implementation shape
   - benefits
   - risks
   - migration/rollback path
   - tests or probes needed
   - evidence that makes it fit or not fit the repo
7. Recommend one option only after comparing it against the constraints.

## Evidence Safety

Never print raw secrets, tokens, private keys, wallet keys, credential files, or `.env` values. Redact secret-like values and cite only the file/path/key name needed to explain the issue.

## Output

Use a short decision memo. Separate facts from judgment. Call out unknowns that would change the recommendation.

When requested, include a compact `Workflow Trace` with mode, ECF contract status, lenses covered, spawned agents or no-subagent reason, verification method, and coverage gaps.
