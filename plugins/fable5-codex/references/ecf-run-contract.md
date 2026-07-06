# ECF Run Contract

Fable-5 for Codex uses an ECF-style run contract to make agent work explicit, bounded, and auditable. The contract is a governance and provenance layer. It does not itself spawn Codex subagents.

## Runtime Split

- ECF contract: records intent, scope, authority, lenses, evidence rules, verification policy, and receipt fields.
- Codex subagent runtime: spawns real subagents when the user explicitly authorizes subagents and the runtime exposes a subagent tool.
- Fable skill: maps the task, creates the contract, delegates independent lenses when allowed, verifies candidates, and reports the trace.

## Authorization Gate

Use real Codex subagents only when all conditions are true:

1. The user explicitly asks for subagents, delegation, or parallel agent work in the current request.
2. A subagent tool is available in the current Codex runtime.
3. The task benefits from independent exploration, verification, or disjoint implementation slices.

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
- `userAuthorization`: exact subagent authorization phrase, or empty when not authorized
- `requiredLenses`: lens names and target responsibilities
- `delegationPolicy`: when to spawn, when to stay local, and how to split work
- `evidencePolicy`: source, command, runtime, artifact, redaction, and unknown rules
- `verificationPolicy`: how candidates must be reproduced, refuted, or bounded
- `receipt`: final mode, subagent IDs, validation, coverage gaps, and unknowns

## Public OSS Boundary

The public plugin may ship Micro ECF-style contracts, templates, and reporting rules. Do not include private Full ECF internals, private customer evidence, private connector details, secrets, wallet material, or enterprise runtime code in this OSS package.
