# Platform Architecture Sketch

A full Fable-5 product should store workflow state, not just prompts.

Core entities:

- `FableRun`: audit, review, fact-check, understand, design, or sweep run metadata.
- `EcfRunContract`: Micro ECF-style contract with scope, authority, required lenses, delegation policy, evidence policy, verification policy, and receipt fields.
- `WorkflowTrace`: final execution mode, real subagent IDs or no-subagent reason, verification method, coverage gaps, and unknowns.
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

The public OSS package should ship contract templates and trace rules only. Private Full ECF runtime internals, enterprise context, private connector details, and customer evidence do not belong in the Codex plugin.
