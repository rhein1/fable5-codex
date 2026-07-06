# Platform Architecture

The plugin is the human-facing UX. A larger product should center on the evidence ledger.

## Ledger Objects

- `Run`: mode, scope, focus, status, prompt version, timestamps
- `EcfRunContract`: scope, authority, required lenses, delegation policy, evidence policy, verification policy, and receipt fields
- `WorkflowTrace`: final mode, subagent IDs or no-subagent reason, local verification, coverage gaps, and unknowns
- `ReviewContract`: bot-compatible `LGTM` / `Needs Updates` verdicts, blocking sections, and review-loop findings
- `TargetMap`: entrypoints, call paths, data stores, docs, tests, unknowns
- `CandidateFinding`: proposed issue from a lens pass
- `JudgeVote`: reproduction, refutation, impact, and severity judgment
- `Refutation`: why a candidate was rejected or downgraded
- `CoverageGap`: area that remained unread, partial, or unverifiable
- `FinalReport`: findings, evidence, coverage, unknowns, and next probes

## Product Evolution

1. Personal plugin
2. Repo-scoped OSS package with fixtures
3. Micro ECF-style run contracts and honest Workflow Trace reporting
4. GitHub Action / CI wrapper using `codex exec`
5. Server-side orchestration using a Codex SDK adapter
6. Dashboard for evidence, coverage, judge votes, contracts, review verdicts, and repeatable audits
