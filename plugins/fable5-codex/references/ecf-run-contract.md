# ECF Run Contract

Fable-5 for Codex uses an ECF-style run contract to make agent work explicit, bounded, and auditable. The contract is a governance and provenance layer. It does not itself spawn Codex subagents.

## Runtime Split

- ECF contract: records intent, scope, authority, lenses, evidence rules, verification policy, and receipt fields.
- Codex subagent runtime: spawns real subagents when the task policy calls for them and the runtime exposes a subagent tool.
- Fable skill: maps the task, creates the contract, delegates independent lenses when allowed, verifies candidates, and reports the trace.

## Authority Split

Use the main-agent/subagent split as a hard safety boundary:

- Subagents may research, map, plan, draft, find candidate issues, or verify candidate issues inside their assigned lens.
- Subagents should be read-only by default unless the user explicitly asks for write-enabled parallel implementation and the main agent gives each worker a disjoint write scope.
- The main agent owns side effects: final findings, file edits, commits, pushes, GitHub comments, issue edits, PR creation, deploys, publishing, credential mutation, and wallet/money actions.
- The main agent must spot-check load-bearing subagent claims before acting on them.
- If a subagent returns a structurally wrong plan or verdict, do not silently re-run or repair it into a claim of independent agreement. Report the problem, bound the uncertainty, or ask for a rerun when needed.
- Snapshot `git status --porcelain` before and after delegated work when the runtime gives subagents command access. If a read-only subagent changed files, stop and report the unexpected mutation.
- Save important subagent plans, verdicts, or candidate lists to a scratch artifact when a long run might outlive context.

## Subagent Trigger Policy

Use real Codex subagents for large or high-risk tasks when all conditions are true:

1. The user has not opted out with a phrase such as "no subagents" or "single agent only".
2. A subagent tool is available in the current Codex runtime.
3. The task benefits from independent exploration, verification, or disjoint implementation slices.

Treat a task as large or high-risk when any of these are true:

- scope is repo-wide, cross-package, cross-directory, or affects many files
- the user asks for exhaustive audit, deep review, broad sweep, migration, launch readiness, or "find every place"
- the task touches money, auth, privacy, secrets, data migrations, public APIs, serialized contracts, deploys, or production operations
- more than three independent lenses are needed to cover correctness, security, data, operations, tests, and docs-vs-reality

Explicit user requests for subagents still force the same preference even for smaller scopes when the runtime exposes a subagent tool. For write-enabled work, keep subagents read-only unless the user explicitly grants disjoint write scopes.

If any condition is false, run the same lenses locally and report `single-agent multi-lens`.

Never claim `multi-agent`, `parallel review`, `independent subagents`, or similar language unless real subagent IDs or runtime-visible subagent handles exist.

## Default Audit Lenses

- correctness, edge cases, and integration contracts
- security, privacy, authn/authz, and secret handling
- data consistency, persistence, idempotency, and migrations
- operations, startup, observability, tests, and docs-vs-reality

For reviews, fact checks, understanding, design options, and sweeps, adapt the lenses to the task while keeping them disjoint enough that agents can work independently.

## Required Workflow Trace

Every Fable-5 report should include this trace when the task has audit, review, fact-check, design, or sweep risk:

```text
Workflow Trace
- mode: multi-agent | single-agent multi-lens
- ECF contract: declared inline | artifact path | not emitted
- subagent trigger: large-task policy | explicit user request | not used
- authorization phrase: <quoted user phrase or none>
- subagent tool: <tool name or unavailable>
- spawned agents:
  - <agent_id>: <lens>
- lenses covered:
  - <lens names>
- local verification:
  - <commands, source reads, runtime probes, or reason verification was bounded>
- coverage gaps:
  - <unread, partial, or unverifiable areas>
```

If no subagents were used, replace `spawned agents` with `no-subagent reason`.

## Contract Fields

- `contractVersion`: string such as `fable5-ecf-0.1`
- `mode`: `multi-agent`, `single-agent-multi-lens`, or `single-agent`
- `authority`: boundaries such as `read-only`, `write-scoped`, `no-deploy`, or `no-secrets`
- `scope`: target paths, PRs, commits, docs, or runtime surfaces
- `userAuthorization`: exact subagent authorization phrase, auto-trigger reason, or empty when not requested
- `requiredLenses`: lens names and target responsibilities
- `delegationPolicy`: when to spawn, when to stay local, and how to split work
- `authoritySplit`: what subagents may do and what the main agent alone may do
- `evidencePolicy`: source, command, runtime, artifact, redaction, and unknown rules
- `verificationPolicy`: how candidates must be reproduced, refuted, or bounded
- `receipt`: final mode, subagent IDs, validation, coverage gaps, and unknowns

## Review Contract

When a Fable run is reviewing a PR or driving a review loop, use `../templates/fable-review-contract.md` for the verdict shape. Keep the review contract and any bot prompt in sync: if the review sections or blocking rules change, update the skill instructions and parser/loop expectations together.

## Public OSS Boundary

The public plugin may ship Micro ECF-style contracts, templates, and reporting rules. Do not include private Full ECF internals, private customer evidence, private connector details, secrets, wallet material, or enterprise runtime code in this OSS package.
