---
name: fable-understand
description: Source-grounded codebase understanding for behavior, architecture, boot flow, data flow, integration wiring, or "how does this work" questions. Use when the user asks Codex to explain a system, trace a path, map a subsystem, or answer behavior questions with citations and unknowns.
---

# Fable Understand

Answer from implementation evidence, not memory or stale docs.

For ECF-style governed runs, use `../../references/ecf-run-contract.md`. For large or high-risk understanding tasks, use real Codex subagents when the runtime exposes a subagent tool and the user has not opted out; treat cross-module architecture, boot flow, data flow, integration wiring, security/privacy/money/data/API, or many-file mapping questions as large by default. Otherwise run `single-agent multi-lens` and say why no subagents were used when workflow trace is requested.

For large or high-risk Fable tasks, recommend running the parent task on `gpt-5.6-sol` with Ultra (`model_reasoning_effort = "ultra"`) when available. Ultra may delegate proactively, but still explicitly request parallel delegation for disjoint Fable lenses when the runtime supports subagents; otherwise use `single-agent multi-lens` and report the reason.

## Workflow

1. Restate the question and scope.
2. Restate authority boundaries and declare the ECF run mode when the user asks for ECF, subagents, or a receipt.
3. Read repo instructions and the most direct source files.
4. Trace from entrypoint to effects:
   - route/command/UI entry
   - service/module boundaries
   - data reads/writes
   - external calls
   - errors, retries, and fallbacks
   - tests and docs that confirm or contradict behavior
5. Inspect callers and importers before answering behavior questions.
6. Use a small diagram or ordered flow when it improves clarity.
7. Include unknowns, assumptions, and stale-doc risks.

## Evidence Safety

Never print raw secrets, tokens, private keys, wallet keys, credential files, or `.env` values. Redact secret-like values and cite only the file/path/key name needed to explain the issue.

## Output

Prefer this shape:

- direct answer
- source-backed flow
- important edge cases
- unknowns or verification gaps
- useful next probe, only if needed

Every non-obvious claim should have a file, line, command, artifact, or runtime citation.

When requested, include a compact `Workflow Trace` with mode, ECF contract status, lenses covered, spawned agents or no-subagent reason, verification method, and coverage gaps.
