# Platform Architecture Sketch

A full Fable-5 product should store workflow state, not just prompts.

Core entities:

- `FableRun`: audit, review, fact-check, understand, design, or sweep run metadata.
- `CandidateFinding`: issue proposed by a lens pass.
- `JudgeVote`: reproduction, refutation, impact, and severity evaluation.
- `CoverageArea`: areas read, partially read, unread, or unverifiable.
- `Unknown`: missing evidence that materially affects confidence.

Execution shape:

```text
map target
run independent lens jobs
dedupe candidates
verify candidates
preserve refutations
run completeness critic
target gap pass
render report
```

Start with a Codex CLI adapter using `codex exec`; add a server-side Codex SDK adapter only after real runs identify what needs durable orchestration.

