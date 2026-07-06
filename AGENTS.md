# Fable-5 Repo Instructions

Use this repository to develop and validate the Fable-5 Codex plugin.

## Working Method

For substantive engineering tasks, prefer the Fable-5 workflow style:

1. Map the target before changing it.
2. Split discovery into independent lenses when the task benefits from broader coverage.
3. Require evidence for claims: file path, line number when available, and quoted source or observed behavior.
4. Verify candidate findings adversarially before reporting them as real.
5. Preserve unknowns, refuted findings, and coverage gaps instead of hiding them.
6. For audits, reviews, fact-checks, sweeps, and design choices, use the installed Fable-5 Codex skills:
   - `$fable-audit`
   - `$fable-deep-review`
   - `$fable-fact-check`
   - `$fable-understand`
   - `$fable-design-options`
   - `$fable-sweep`

Use real Codex subagents for large or high-risk Fable tasks when the runtime exposes a subagent tool and the user has not opted out. Treat repo-wide, cross-package, security/privacy/money/data/API, migration, release, exhaustive audit, deep review, and broad sweep tasks as large by default. For routine edits, use the rigor rules without spawning extra agents.

## Package Rules

- Keep plugin code under `plugins/fable5-codex/`.
- Keep the repo marketplace at `.agents/plugins/marketplace.json`.
- Keep marketplace `source.path` relative and `./`-prefixed.
- Do not introduce absolute user-specific paths into repo docs or marketplace files except in examples clearly labeled as local paths.
- Run `scripts/validate-package.ps1` after changing packaging, skills, schemas, scripts, or custom-agent profiles.
