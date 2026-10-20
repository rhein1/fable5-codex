# Fable-5 Method

Fable-5 is an evidence-first workflow for codebase work. The method is useful when a task has enough risk that a single broad pass is likely to miss edge cases.

Fable-5 for Codex now treats this method as an ECF-style run contract. The contract records scope, authority, required lenses, delegation policy, evidence policy, verification policy, and receipt fields. It is a governance layer; Codex subagents are still a runtime capability exposed by the active session. Large or high-risk Fable tasks request them unless the user opts out, and an explicit user request can trigger them for smaller scopes.

## Core Loop

```text
map target
run independent lens jobs
dedupe candidate findings
verify candidates
preserve refutations
run completeness critic
target gap pass
render report
```

## Multi-Subagent Contract

Resolve supported coordinator/worker profiles through the shared [model policy](../plugins/fable5-codex/references/model-support.md). Use useful independent lenses for large or high-risk work, preserving opt-outs and actual runtime IDs. Keep synthesis and final verification with the coordinator. Quick completion checks avoid unnecessary fan-out. Record requested/actual profiles and fallbacks; otherwise report `single-agent multi-lens`.

Default audit lenses:

- correctness, edge cases, and integration contracts
- security, privacy, authn/authz, and secret handling
- data consistency, persistence, idempotency, and migrations
- operations, startup, observability, tests, and docs-vs-reality

Authority split:

- Subagents may research, map, plan, draft, find candidate issues, or verify candidates within their assigned lens.
- The main agent owns spot-checking, final findings, write actions, commits, pushes, GitHub comments, deploys, publishing, credential mutation, and money/wallet actions.
- If subagent output is structurally wrong or unsupported, preserve it as refuted or unknown instead of treating it as independent agreement.

## Evidence Standard

Every substantive claim should point to at least one of:

- source file and line
- command and relevant output
- runtime probe
- generated artifact
- documented unknown that blocks stronger verification

## Report Discipline

For audits and reviews, findings come first and are ordered by severity. Summaries are secondary. Unknowns and refuted candidates are preserved when they affect confidence.

Reports should include a compact Workflow Trace when the task has audit, review, fact-check, design, or sweep risk. The trace must distinguish `multi-agent` from `single-agent multi-lens` and must not claim subagent work without real subagent IDs or runtime-visible handles.

For PR reviews that need bot-loop compatibility, use `plugins/fable5-codex/templates/fable-review-contract.md`.
