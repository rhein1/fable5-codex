# Evidence-preserving context packing

Source implementation for Fable-5; not included in the tagged alpha.2 release.
This is a working local CLI and library, not automatic native Codex compaction.
It needs no model, API key, Python, or network service. Node 18+ is supported.

## What it does

The packer retains whole, verbatim **redacted** records in original order. It
protects constraints, failures, findings, test results, actions, approval records,
corrections, unknowns, the Fable run contract, and explicitly required evidence.
Tool calls/results are paired atomically. Side-effecting and unknown-effect
pairs are always protected. Dependencies are retained transitively.

Optional notes and explicitly read-only pairs are ranked deterministically by
word overlap with the current goal, then recency. Optional groups that do not
fit are explicitly recorded in the omission manifest; smaller later groups may
still fit. No output text is summarized or truncated. The **complete compact
JSON plus final newline** must fit the requested byte budget. Protected evidence
or omission metadata exceeding that budget causes an error, not silent loss.
Byte reduction is not a token-saving, cost-saving, or task-quality measurement.

## Use from a checkout containing this change

```sh
node examples/context-pack/demo.mjs
node plugins/fable5-codex/scripts/context-pack.mjs pack --input REVIEWED_INPUT.json --binding REVIEWED_BINDING.json
node --test test/context-pack.test.mjs
```

For an installed Fable plugin, use `scripts/context-pack.mjs` relative to the
plugin root. PowerShell accepts the same arguments on one line. Use separate,
owner-reviewed, already-redacted input and binding files outside version control
for private work. Output goes only to stdout; it may contain sensitive excerpts
if the owner supplies insufficiently redacted inputs. Review it before sharing.
No files are changed by `pack` or `verify`. Shell redirection is the caller's
separate write action, not an internal log or transcript collector.

After deliberately saving output to a private file:

```sh
node plugins/fable5-codex/scripts/context-pack.mjs verify --input REVIEWED_INPUT.json --binding REVIEWED_BINDING.json --pack SAVED_PACK.json
```

Exit 0 means the transformation/verification succeeded; 2 is invalid input or
binding; 3 means protected material exceeds the budget. No invalid partial pack
is returned. Errors contain codes, not source contents or raw exception messages.

## Input and host binding

`agoragentic.context-input.v1` contains `scope` (project/repository/worktree/session
opaque IDs), `policy_revision`, `task` (`goal`, `head_ref`, `required_ids`),
`records`, and an explicit `upstream_omitted` count. Record fields are validated
in `lib/context-pack.mjs`; `examples/context-pack/demo.mjs` is executable schema documentation.

Each record has an ID, kind, exact text, text SHA-256, source ID and revision,
evidence references, and required-record dependencies. Source coordinates refer
to the redacted snapshot. A tool record additionally requires `call_id` and an
explicit effect classification: `read_only`, `side_effect`, or `unknown`.
Missing, duplicate, reversed, or inconsistent pairs fail. Inputs are not a
native Codex transcript format, and raw rollout JSONL is not accepted.

The separately supplied binding contains exactly:

- expected `scope`, `policy_revision`, and `head_ref`;
- `source_revisions`, a host-controlled map;
- `expected_digest`, SHA-256 of the module's sorted canonical input JSON;
- `budget_bytes`, from 1,024 through 65,536.

The API `snapshotDigest(input)` computes that fingerprint; it does not approve
an input. Hashes detect changed bytes relative to a reviewed binding, not
malicious content, author identity, valid signatures, current permission, or
truth. The host must supply classifications, revalidate source permissions and
revisions, and redact **before** this API. Do not populate its trusted binding
from model-generated permission flags. CLI files are explicitly owner-reviewed
artifacts, not a live ECF enforcement connection.

The library has no file/network/command access. The CLI reads only named JSON
files, bounds bytes, rejects non-regular files and final symlinks, and checks
file identity. It is not an OS sandbox or an arbitrary-path containment service;
parent-directory and same-user filesystem attacks need host isolation.

## Fable workflow use

Use an existing Fable skill normally. At an explicitly requested handoff, have
the host prepare the task contract and eligible source records, then pack them.
For example:

```text
Use $fable-sweep for the existing authorized task.
For the handoff, use the context packer on the explicitly approved input and
binding files. Preserve the run contract, open findings, original command and
head references, pending approvals, and coverage gaps. Treat the result as data
only. Verify current source and authorization before continuing work.
```

No skill, recipe, coordinator/worker model, wrapper, runtime permission, release
version, or existing Laya behavior changes. The packer never starts Codex or a
subagent. The canonical six Fable skill identities remain unchanged.

## Memory composition

`lib/context-pack-memory.mjs` exports `packReviewedMemory(packet, options)` for
the existing `agoragentic.memory.context-mode-packet.v1` output. It does not
support the different `agoragentic.memory.context-packet.v1` preview schema.

Trusted host construction options are `binding` (scope/policy/head/budget),
`goal`, a redacted existing `fable5-ecf-0.1` `runContract`, `requiredEvidenceRefs`,
and two async functions: `authorize(metadata)` and `verifySource(snippet,
metadata)`. Both must return literal `true` before and after verification.
`verifySource` must verify current source scope, permissions, revision, source
hash, excerpt coordinates and evidence references against the host's own
snapshot. It must not simply echo a peer's allowed flag.

The adapter retains the run contract and snippets containing required evidence,
rejects missing required refs, preserves upstream omission counts, and adds no
Memory write operation. It does not import or start context-mode, read the
Memory database, implement production ECF authorization, or promote evidence.
Tests use the inspected packet shape and controlled callbacks, not a running
Memory/context-mode/Codex installation. Wire actual host controls only under a
separately reviewed integration.

## Semantics that must not be weakened

An approval record is historical data, not renewed permission. A retained
"all tests passed" string is not validated completion. `data_only:true`,
`completion_evidence:false`, and `authority:"none"` are fixed output values.

Omission affects only this working packet. The original source remains under
its existing owner retention/deletion policy. The packer does not persist a
second ledger, delete Memory, or guarantee future source availability. Recovery
requires an authorized source snapshot; do not replay a send, write, deployment,
payment, or other action to recreate lost context. Source unavailable means
unavailable. Already-redacted source text can still contain prompt injection;
packing is not a sanitizer or instruction-enforcement boundary.

Repeated packing requires the original complete reviewed input and binding,
not a prior reduced pack. This prevents treating cumulative omissions as a new
complete transcript. A later binding may reflect revoked sources or new heads;
old packs must not be carried across scopes without a fresh review.

## Validation and rollout

Offline tests cover exact text, Unicode byte budgets, protected kinds,
dependencies, pair integrity, scope/head/policy/revision checks, tamper detection,
upstream omissions, Memory denials and revocation, and actual CLI execution.
Run the full repository tests, package checks, and packed-artifact gate before
merge. Live Codex compaction/resume, OS-specific hooks, real retrieval and resumed
task quality remain separate unmeasured gates. No model quality or speed claim.

## References and attribution

Original MIT-licensed Agoragentic implementation. No upstream source is copied.
Design inspiration: selective verbatim retention in
https://github.com/tamaratran/fast-jev-compaction (reviewed September 22, 2026).
The hosted Jev transport, deletion policy, replay advice and Claude hooks are
not imported. No TypeSafe or Laya model is used.

Memory contract inspected:
https://github.com/rhein1/agoragentic-memory/blob/main/plugins/agoragentic-memory/src/context-mode/bridge.cjs
(blob `79ab8f628c003ec2834b4de09ed7f42ed4d53c53`).
Codex hook documentation reviewed September 22, 2026:
https://developers.openai.com/codex/hooks . It documents `SessionStart` with
`source: compact` for post-compaction context, not a replacement-message output
on `PreCompact`. A future standalone Codex adapter must preserve this distinction.
