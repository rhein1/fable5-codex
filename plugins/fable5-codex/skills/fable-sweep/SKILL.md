---
name: fable-sweep
description: Repo-wide implementation workflow for renames, migrations, consistency updates, generated-surface sync, docs/tests updates, and cross-cutting cleanup. Use when the user asks for a Fable-5 sweep, broad rename, consistency pass, migration, or "find every place and update it" task.
---

# Fable Sweep

Perform broad changes with discovery first and scoped edits second. Do not mutate unrelated worktree changes.

## Workflow

1. Restate the target change and authority boundaries.
2. Read repo instructions and identify generated, public, config, docs, tests, and serialized surfaces that may need updates.
3. Build a complete hit list using fast search first:
   - `rg` for identifiers, strings, docs, config, tests, migrations, snapshots, and generated files
   - language-aware search or AST tools when available and useful
   - import/caller lookup for behavior changes
4. Classify hits:
   - must edit
   - must preserve for compatibility
   - generated or external
   - uncertain
5. Make scoped edits only after the discovery map is clear. Preserve existing style and local helper APIs.
6. Run targeted validation. Include tests, lint, type checks, snapshot regeneration, or schema validation when relevant.
7. Report changed files, preserved compatibility points, validation, and remaining uncertain areas.

## Safety

Stop and ask before irreversible changes, external publishing, deploys, credential mutation, wallet spend, trust-state mutation, or destructive cleanup. For normal code edits, proceed when the user asked for implementation.

