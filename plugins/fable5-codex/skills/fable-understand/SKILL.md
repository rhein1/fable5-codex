---
name: fable-understand
description: Source-grounded codebase understanding for behavior, architecture, boot flow, data flow, integration wiring, or "how does this work" questions. Use when the user asks Codex to explain a system, trace a path, map a subsystem, or answer behavior questions with citations and unknowns.
---

# Fable Understand

Answer from implementation evidence, not memory or stale docs.

## Workflow

1. Restate the question and scope.
2. Read repo instructions and the most direct source files.
3. Trace from entrypoint to effects:
   - route/command/UI entry
   - service/module boundaries
   - data reads/writes
   - external calls
   - errors, retries, and fallbacks
   - tests and docs that confirm or contradict behavior
4. Inspect callers and importers before answering behavior questions.
5. Use a small diagram or ordered flow when it improves clarity.
6. Include unknowns, assumptions, and stale-doc risks.

## Output

Prefer this shape:

- direct answer
- source-backed flow
- important edge cases
- unknowns or verification gaps
- useful next probe, only if needed

Every non-obvious claim should have a file, line, command, artifact, or runtime citation.

