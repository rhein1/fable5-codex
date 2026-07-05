# Platform Architecture

The plugin is the human-facing UX. A larger product should center on the evidence ledger.

## Ledger Objects

- `Run`: mode, scope, focus, status, prompt version, timestamps
- `TargetMap`: entrypoints, call paths, data stores, docs, tests, unknowns
- `CandidateFinding`: proposed issue from a lens pass
- `JudgeVote`: reproduction, refutation, impact, and severity judgment
- `Refutation`: why a candidate was rejected or downgraded
- `CoverageGap`: area that remained unread, partial, or unverifiable
- `FinalReport`: findings, evidence, coverage, unknowns, and next probes

## Product Evolution

1. Personal plugin
2. Repo-scoped OSS package with fixtures
3. GitHub Action / CI wrapper using `codex exec`
4. Server-side orchestration using a Codex SDK adapter
5. Dashboard for evidence, coverage, judge votes, and repeatable audits

