# FableCodex-inspired augmentation: source and qualification record

Date: 2026-10-01. This is an unreleased source addition, not an installed-plugin
update, model-capability improvement, or replacement of the six Fable skills.

## Sources inspected

- Reference: `baskduf/FableCodex`, README at commit
  `406faa1981ffe8a3b6b44e770bc2fc2ee189c8d0`, README blob
  `51b43df684e15b1f41b6bb45e9bc6a76be8483a6`.
  https://github.com/baskduf/FableCodex/blob/406faa1981ffe8a3b6b44e770bc2fc2ee189c8d0/README.md
- Target base: `rhein1/fable5-codex` main commit
  `154bf0b220566d91d1a4aaf4390d9c3a54926c3a`, tree
  `a4fe3b2dba3c44a354a790d840cabe509608e0a8`.
- Existing ECF run contract, review contract, sweep/deep-review skills, package
  manifest, test launcher and package validation implementation inspected through
  the GitHub connector. No claim that every pre-existing source file was audited.

The reference README identifies its license as AGPL-3.0-or-later. This change
uses high-level workflow ideas only. The runtime, event format, tests and prose
are newly authored for this MIT repository. No upstream Python code, prompt
text, headings corpus, provider bridge, updater, assets or license is vendored.
This provenance statement is not a general license-compatibility opinion.

## Comparison and decisions

| Reference idea | Existing Fable capability | Addition or deliberate exclusion |
| --- | --- | --- |
| Goal checkpoints with evidence | Evidence-first workflows and ECF run contracts | Dependency-aware recorded goals, pinned plan and host scope/revision/policy binding. |
| Finding gate | Bot-readable blocking and nonblocking review sections | Executable closeout accounting that preserves optional notes and fails on unresolved high-risk findings. |
| Verification before completion | Per-skill validation and workflow traces | Required typed checks; later check changes invalidate earlier goal and resolution records. |
| Coverage accounting | Independent lenses, hit maps and coverage gaps | Required task-surface coverage; no source-prompt-heading parity score. |
| Durable local state | Existing ECF/Memory boundaries | Explicit-file immutable transformations, not another automatic/shared state store. |
| Provider bridge and updater | Existing selected models, wrappers and default-off Laya | Not imported or activated. No provider/model/permission changes. |

The implemented behavior is described in
[the packaged closeout reference](../plugins/fable5-codex/references/run-closeout.md).
The CLI is `plugins/fable5-codex/scripts/run-closeout.mjs`; the synthetic example
is `examples/run-closeout/demo.mjs`. Tests are automatically discovered by the
existing `scripts/run-tests.mjs`; no workflow permission or dependency change is
required. Existing package inclusion rules already include plugins, examples,
docs and test files.

## Qualification actually performed

Local Linux with Node 22.16.0:

- `node --test test/run-closeout.test.mjs`: 73 passed, zero failed/skipped.
- `node --check plugins/fable5-codex/scripts/run-closeout.mjs`: passed.
- Real local subprocess execution of the CLI, including create/checkpoint/gate,
  different working directories, exit codes, malformed inputs and unchanged
  input files. Input symlinks, hard links, oversized data and invalid UTF-8 were
  tested. Verification strings and evidence URLs were never executed/fetched.
- Synthetic demo exercised incomplete and record-satisfied states. Its evidence
  is explicitly invented; it establishes accounting behavior, not task quality.

Container GitHub DNS resolution prevented a full clone. Relevant base source was
read through the connector; the authored feature and tests were exercised in a
local source subset. The full pre-existing `npm test`, package validator,
PowerShell wrapper, packed-artifact suite and supported OS/Node matrix were not
run locally. Hosted checks must pass at the final PR head before merge.

No actual Codex installation/session, independent subagent, Memory process,
provider, model, production environment, paid call or performance benchmark was
exercised. No improvement in defect detection, latency, token cost, adoption or
model ability is claimed. This is single-agent multi-lens implementation and
self-review, not independent review.

## Merge and follow-through

Review the source, tests, behavior and trust boundary. Confirm the existing
Ubuntu/macOS/Windows and Node 18/24 matrix, packed artifact and release gate on
the new head. Main's existing Windows provider cleanup work remains in separate
PR #25; do not waive a failing gate or fold unrelated changes into this feature.
PRs #22/#23 (context packing/Context Keeper) and #26 (RRSI, stacked on #25) were
open when inspected and are neither assumed merged nor modified here.

Before broader use, test the source on the actual target host with synthetic,
private inputs and a user-requested strict run. The host must independently
provide current bindings and verify real evidence. Preserve all current model,
ECF, Memory, provider and approval settings. Do not install hooks, update global
AGENTS.md, publish a package or auto-merge as part of that qualification.
