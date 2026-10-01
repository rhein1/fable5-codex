# Optional run closeout

This source-only addition augments the six existing Fable workflows. It is not a
seventh skill, a replacement for ECF or Memory, a reviewer approval, or a Codex
runtime enforcement hook. It is original MIT code inspired by the public goal
and findings concepts documented in baskduf/FableCodex. No upstream implementation,
source prompt, provider bridge, updater, or license file is imported.

Use it when the user requests durable checkpoints, strict completion accounting,
or a long-running implementation/review with several goals. Skip it for small
edits and short answers. An explicit opt-out wins. Read-only requests do not grant
permission to create state files. The helper itself only reads explicit files
and emits JSON; saving the output is a separate, authorized host action.

## What is checked

The helper replays a bounded event history against a reviewed plan and a separate
host-supplied binding. It checks that every goal has current passed checks, that
its dependencies were completed first, that required coverage was inspected, and
that blocking findings have fresh resolution records. It never runs commands or
opens evidence references. A command string is a record, not execution proof.

`RECORDS_SATISFIED` means the supplied records meet this accounting contract.
It does **not** mean tests really passed, all findings were discovered, independent
review occurred, a deployment is safe, or any action is authorized. The output
always includes `evidenceVerified: false` and `authorityGranted: false`. Never
translate that verdict automatically into `LGTM`, a merge, Memory completion,
ECF authorization, publishing, payment, or release readiness.

## Trusted host responsibilities

Before each checkpoint and gate, the coordinator must independently confirm the
current run, canonical repository/worktree identity, source revision, ECF policy,
and reviewed plan. Supply that binding separately; do not simply copy it out of
an untrusted ledger. `revision` must identify the actual candidate bytes, including
relevant dirty/untracked files and external source revisions when applicable.
A Git HEAD alone does not establish a clean worktree or fresh external evidence.

Freeze the candidate scope before collecting its closeout evidence. When source,
policy, scope or plan changes, create a newly bound ledger and gather current
verification rather than relabeling old events. The helper does not scan Git,
verify permissions, attest checks, redact data, or consult a trusted clock.

The plan digest prevents unnoticed plan changes relative to the separately
pinned binding. It is not a signature or authorization. Sequential checkpoints
preserve earlier events, but files are **not tamper-evident storage**: a writer can
replace, truncate or rebuild history and recompute sequence numbers. There is no
claim that all previous findings are present. Preserve the authoritative history
in your existing trusted ECF/Memory host when that guarantee is required; do not
add an automatic importer. This helper is not safe against a malicious local
filesystem writer and is not an OS sandbox.

## CLI

Requires Node 18 or newer. Run from a checkout containing this source addition:

```sh
node examples/run-closeout/demo.mjs
node plugins/fable5-codex/scripts/run-closeout.mjs --help
node --test test/run-closeout.test.mjs
```

The demo uses deliberately synthetic evidence and performs no project execution.
For a real run, prepare a reviewed `PLAN.json` and use this command to obtain its
fingerprint, then pin that digest in a separately reviewed `BINDING.json`:

```sh
node plugins/fable5-codex/scripts/run-closeout.mjs fingerprint --plan PLAN.json
node plugins/fable5-codex/scripts/run-closeout.mjs create --plan PLAN.json --binding BINDING.json
node plugins/fable5-codex/scripts/run-closeout.mjs checkpoint --ledger LEDGER.json --binding BINDING.json --event EVENT.json
node plugins/fable5-codex/scripts/run-closeout.mjs status --ledger LEDGER.json --binding BINDING.json
node plugins/fable5-codex/scripts/run-closeout.mjs gate --ledger LEDGER.json --binding BINDING.json
```

All results go to stdout. Retain each create/checkpoint result as a **new private
file** outside version control using the host's reviewed persistence mechanism.
Never redirect output onto an input file: shell redirection can destroy it before
the command starts. There is no automatic persistence, overwrite, locking,
background polling, session discovery, default state directory or migration.

Gate exits: `0` records satisfied; `1` incomplete; `2` invalid input/binding.
`status` returns the same report but exits `0` for a valid incomplete ledger.
Invalid input emits a bounded error code to stderr without echoing its contents.

Inputs must be canonical, single-link regular files of at most 1 MiB. Symlink
leaves/ancestors, hard links, directories, oversized files and invalid UTF-8/JSON
are rejected. On systems with directory aliases, pass the resolved canonical path.
The caller owns private ACLs, redaction, retention and safe output handling;
outputs from create/checkpoint contain the supplied evidence. Status/gate omit
raw observations, commands and evidence references. Do not store credentials,
private transcripts, customer data, private Full ECF internals or reusable grants.

## Plan and binding

The executable synthetic plan and binding are exported by
`../../../examples/run-closeout/demo.mjs` in the full repository. The library and
this reference are self-contained in the plugin; examples are not needed at runtime.

A plan has exactly `goals`, `checks`, and `coverage`, each a nonempty list of at
most 128 entries. IDs are unique across the lists. Every goal requires one or
more check IDs; dependencies must form an acyclic graph. At least one check and
one coverage item must be required. All goals are required for closeout.

```json
{
  "goals": [{"id":"verify","title":"Verify candidate","dependsOn":[],"checkIds":["tests"]}],
  "checks": [{"id":"tests","title":"Regression suite","kind":"command","required":true}],
  "coverage": [{"id":"changed_files","title":"Inspect every changed file","required":true}]
}
```

Check kinds are `command`, `source`, or `connector`; all are recorded observations,
not execution engines. A source inspection can satisfy an analysis-only goal
when the reviewed plan explicitly calls for it. Do not silently weaken a required
runtime/CI check into a source read after failure.

Binding fields are exactly `runId`, `scopeId`, `revision`, `policyDigest`, and
`planDigest`. The first three are nonempty host-defined identifiers. Both digests
are lowercase SHA-256 hex strings. The policy digest binds a reviewed policy;
it does not validate the policy or grant its permissions.

## Events and transitions

Every event has `type`, `id`, and a nonempty `evidence` array of at most eight
`{"ref":"redacted source identifier","observation":"observed result"}` objects.
The helper assigns contiguous `seq` values. Unknown fields, IDs, statuses,
versions, duplicate findings and histories longer than 2,000 events are rejected.

| Type | Additional fields | Meaning |
| --- | --- | --- |
| `check` | `status`, `detail` | `passed`, `failed`, or `unavailable`; detail records the command/source/connector operation, never executes it. |
| `goal` | `status` | `complete` requires passed checks and current completed dependencies; `blocked` remains incomplete. |
| `coverage` | `status` | `inspected` or `unavailable`; missing required inspection blocks. |
| `finding.open` | `title`, `section`, `risk` | Adds a finding with immutable classification. |
| `finding.close` | `status`, `checkIds` | `resolved` or `refuted`, supported by checks passed after the latest open/reopen. |
| `finding.reopen` | none | Reopens a closed finding; new verification is required. |

A new result for a goal's check, even another pass, invalidates the earlier goal
checkpoint and its dependent goals. Recheckpoint in dependency order after the
new verification. A changed resolution check also makes a finding's old closeout
stale: reopen, verify after reopening, close, then refresh affected goals. Failed
and unavailable attempts remain in history. No implicit waiver, deferred status,
severity downgrade or retry deletion makes a blocker disappear.

Review sections map to the existing [review contract](../templates/fable-review-contract.md):
`Needs Fixing` and `Requires Human Review` block; `Recommended Optional` and
`Create Follow-up Issue` remain visible without blocking normal-risk completion.
As a conservative safeguard, an unresolved/stale finding with risk `security`,
`privacy`, `authz`, `money`, `data-integrity`, `migration`, `secrets`, or `trust`
always blocks, even when entered in an optional section. `normal` is the only
nonblocking risk. The host still owns honest classification and human-review
requirements; the helper does not verify a human's identity or approval.

## Existing system boundaries

Keep the selected Fable skill, ECF authority split, requested/actual model and
worker reporting, independent-lens discipline, explicit user choices and optional
Laya selector unchanged. The closeout plan can reference existing ECF artifacts;
it does not extend the ECF schema or create another source of authority. Context
packing and Context Keeper integration are not assumed to be merged or active.
No hooks, provider access, installed configuration, dependency, marketplace,
version, release, or paid execution is changed by this addition.
