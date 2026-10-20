---
name: fable-sweep
description: Repo-wide implementation workflow for renames, migrations, consistency updates, generated-surface sync, docs/tests updates, and cross-cutting cleanup. Use when the user asks for a Fable-5 sweep, broad rename, consistency pass, migration, or "find every place and update it" task.
---

# Fable Sweep

Perform broad changes with discovery first and scoped edits second. Do not mutate unrelated worktree changes.

For ECF-style governed runs, use `../../references/ecf-run-contract.md`. For large sweeps, use real Codex subagents when the runtime exposes a subagent tool and the user has not opted out; treat repo-wide renames, migrations, consistency passes, generated-surface syncs, docs/tests syncs, and "find every place" tasks as large by default. Otherwise run `single-agent multi-lens` and say why no subagents were used when workflow trace is requested.

Use the centralized capability-aware profiles in `../../references/model-support.md` and `../../config/model-profiles.json`. Keep model and reasoning selections configurable, preserve explicit overrides, and record the requested and actual coordinator model and effort and requested and actual worker model plus any fallback. Request parallel delegation only for useful disjoint lenses; report `single-agent multi-lens` when no workers ran. The coordinator owns synthesis and final verification. Never claim a model, effort or subagent ran without runtime evidence.

## Workflow

1. Restate the target change and authority boundaries.
2. Declare the ECF run mode when the user asks for ECF, subagents, or a receipt. Use `multi-agent` only when real subagents will be spawned.
3. Read repo instructions and identify generated, public, config, docs, tests, and serialized surfaces that may need updates.
4. Build a complete hit list using fast search first:
   - `rg` for identifiers, strings, docs, config, tests, migrations, snapshots, and generated files
   - language-aware search or AST tools when available and useful
   - import/caller lookup for behavior changes
5. Classify hits:
   - must edit
   - must preserve for compatibility
   - generated or external
   - uncertain
6. Make scoped edits only after the discovery map is clear. Preserve existing style and local helper APIs.
7. Run targeted validation. Include tests, lint, type checks, snapshot regeneration, or schema validation when relevant.
8. Report changed files, preserved compatibility points, validation, and remaining uncertain areas.

## Evidence Safety

Never print raw secrets, tokens, private keys, wallet keys, credential files, or `.env` values. Redact secret-like values and cite only the file/path/key name needed to explain the issue.

## Safety

Stop and ask before irreversible changes, external publishing, deploys, credential mutation, wallet spend, trust-state mutation, or destructive cleanup. For normal code edits, proceed when the user asked for implementation.

For write-enabled parallel sweeps, assign each worker a disjoint write scope and tell workers they are not alone in the codebase. The main agent owns final integration, conflict resolution, validation, staging, commits, pushes, and external side effects.

When requested, include a compact `Workflow Trace` with mode, ECF contract status, lenses covered, spawned agents or no-subagent reason, verification method, and coverage gaps.

## Optional development playbooks

When the user requests an indexed delivery workflow, scaffold completion, or a
named development recipe, consult `../../prompts/development-index.md` and
`../../references/development-playbooks.md`. Use
`../../scripts/development-prompts.mjs` to search or show one recipe when Node is
available; otherwise read the matching entry in the bundled catalog. Do not load
all recipe bodies by default. Route each stage to the existing skill named in its
entry and retain the normal discovery, edit, and verification workflow above.

A playbook is guidance, not an execution engine or an authorization grant. Resolve
actual refs and edit scope, preserve current ECF/model/worker limits, stop dependent
stages when prerequisites fail, and end with the completion-proof reconciliation.
For read-only requests, return a plan rather than executing scoped-edit stages.
