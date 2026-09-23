# Codex Context Keeper

**Carry the evidence, not the whole transcript.**

Original MIT-licensed Agoragentic software for local, evidence-preserving Codex
handoffs. The standalone CLI packs reviewed context without Fable, Memory,
Python, an API key, a model, or any third-party runtime dependency.

**Source preview: 0.1.0-alpha.1.** Independently installable source, not an npm
release. `private: true` deliberately blocks accidental registry publication.
No live Codex installation or native compaction/resume run has been validated
for this preview. Offline command/hook contract tests are not that evidence.

## What works

The deterministic packer retains whole redacted excerpts, source references,
constraints, failures, findings, test results, action records, approvals,
corrections, unknowns, and explicitly required evidence. It preserves paired
tool calls/results and their dependencies. Optional records are selected by
word overlap and recency under a complete JSON byte budget. Omitted records
remain explicit; protected material that does not fit causes an error.

The CLI can deliberately stage one reduced, reviewed snapshot for a session,
read it back while its binding is valid, and revoke it. The optional Codex hook
announces a valid snapshot after native compaction or resume. The skill then
retrieves the snapshot as **tool data**, not as new developer instructions.

This does **not** replace Codex's native compactor, rewrite rollout files,
automatically collect transcripts, or guarantee that nothing important is lost.
The packer cannot recover evidence that the supplied input never contained.
Historical approvals stay historical; a retained passing-test claim is not proof.

## Try without installing a plugin

Requirements: Node.js 18 or newer. Git is also required for stage/read/hook
binding checks. From this standalone directory or an extracted source archive:

```sh
node examples/demo.mjs
npm test
npm run check
node bin/codex-context-keeper.mjs help
```

These commands require no dependency installation and use synthetic fixtures.
Tests create and remove disposable Git repositories; they do not use your
normal repository or credentials.

For a local npm artifact (not publication):

```sh
npm pack --ignore-scripts
```

The entire directory, including hidden manifests, can be copied to a separate
checkout. It imports nothing from Fable. While maintained in Fable, an additional
root test enforces byte parity between both copies of the shared packer and I/O
modules. Do not edit those copies independently.

## Prepare an explicit reviewed input

The input is `agoragentic.context-input.v1`, not a native transcript. It contains
`scope` (opaque project/repo/worktree/session IDs), `policy_revision`, `task`
(`goal`, exact `head_ref`, `required_ids`), `records`, and `upstream_omitted`.
Each record has `id`, `kind`, exact redacted `text`, text `sha256`,
`source: {id, revision}`, `evidence_refs`, and `requires` dependencies. Source
coordinates/hash are optional. Tool records require a paired `call_id` and an
explicit `effect`: `read_only`, `side_effect`, or `unknown`.

A separate host-reviewed binding specifies the expected scope, policy revision,
Git head, source revision map, canonical input digest, and `budget_bytes`
(1,024 through 65,536). `examples/demo.mjs` shows the complete executable input
and binding. The exported `snapshotDigest(input)` computes the input fingerprint;
it does not approve or redact it.

Use actual current source evidence and a session ID supplied by the host. Never
invent a host session ID or parse rollout files to discover one. The optional
startup hook below provides the current ID. Store private inputs and bindings
outside Git. Redaction, source authorization and correct record classifications
remain the owner's/trusted host's responsibility; this is not a secret scanner.

```sh
node bin/codex-context-keeper.mjs pack --input INPUT.json --binding BINDING.json
```

Output is JSON on stdout. Review before saving or sharing; insufficiently
redacted input produces insufficiently redacted output. No file is changed.

## Stage, read, revoke

Use an absolute, **new dedicated private root** whose parent exists; the command
creates the directory and marker. Existing unmarked roots are rejected. Choose
a location outside repositories, synced folders, shared homes and backups where
possible. Outside-repository placement is an owner obligation, not enforced by
the CLI. Never point this at the normal Codex home or Memory database.

The following uppercase values are placeholders to replace, not literal paths:

```sh
node bin/codex-context-keeper.mjs stage --input INPUT.json --binding BINDING.json --root ABSOLUTE_PRIVATE_ROOT --cwd ABSOLUTE_WORKTREE --session HOST_SESSION_ID --reviewed REVIEWED_REDACTED
node bin/codex-context-keeper.mjs read --root ABSOLUTE_PRIVATE_ROOT --cwd ABSOLUTE_WORKTREE --session HOST_SESSION_ID --policy POLICY_REVISION
node bin/codex-context-keeper.mjs revoke --root ABSOLUTE_PRIVATE_ROOT --session HOST_SESSION_ID
```

PowerShell accepts the same commands on one line. Staging and revocation are
explicit local writes; obtaining a context pack does not authorize either one.
Only the reduced pack is stored, not the source input or a second transcript.
An existing session capsule is never overwritten: explicitly revoke and then
stage a fresh reviewed snapshot when replacement is required.

TTL defaults to ten minutes; `--ttl-ms` permits 1,000 through 3,600,000. Expiry
prevents use but does not physically delete the file. `revoke` unlinks only the
named capsule, not unrelated data or backups. Root/capsule paths are local and
owner-controlled. See SECURITY.md before use on shared machines.

Reads enforce session, canonical working directory, policy, expiry, committed
Git HEAD, integrity and data-only boundary checks. **An unchanged HEAD does not
prove that the worktree, external sources or permissions are unchanged.** Before
continuing actual work, revalidate those live conditions. No stored approval is
renewed by a matching hash. The fixed Git read uses no shell or network command.

## Optional Codex plugin

The portable root `plugin.json`, compatibility `.codex-plugin/plugin.json`,
`skills/`, `hooks/hooks.json`, and self-contained local marketplace are included.
Use the standalone directory, not Fable's root marketplace, to register it:

```sh
codex plugin marketplace add ./PATH_TO_STANDALONE_DIRECTORY
```

Then install Codex Context Keeper from that local marketplace in your Codex
plugin interface and review its hooks. Installation changes Codex configuration;
none of the packer/keeper commands installs or activates it. This preview has
not been exercised in a real Codex installation. First test in an isolated
`CODEX_HOME`, without private input, using your installed host's documented flow.

Hooks remain **off** unless the owner supplies all of these settings in the
Codex launch environment (values are placeholders):

```powershell
$env:CODEX_CONTEXT_KEEPER_ENABLE = "1"
$env:CODEX_CONTEXT_KEEPER_ROOT = "ABSOLUTE_PRIVATE_ROOT"
$env:CODEX_CONTEXT_KEEPER_POLICY = "POLICY_REVISION"
```

The Bash equivalents are ordinary `export NAME=value` settings. These are not
credentials. Do not dump unrelated environment variables to find them. Unset
`CODEX_CONTEXT_KEEPER_ENABLE` or set it to `0` to disable the hooks; this does not
delete staged files. No normal Codex configuration is edited by this project.

On startup the enabled hook emits the current host session ID, without reading
a transcript or creating a snapshot. After an explicit stage, `PreCompact`
checks availability without altering native compaction. On `SessionStart` with
`source: compact` or `resume`, a valid capsule produces only a fixed retrieval
pointer. Ask/use `$codex-context-keeper` to read the packet as data. A missing,
expired, revoked, changed or invalid capsule produces a notice, not a successful
restore claim. Known subagent events and unrelated events are ignored.

The hook's additional context is developer-role material in Codex. Therefore it
never contains source excerpts, shell commands from retrieved text, or arbitrary
paths supplied by a packet. The local read command returns the actual excerpts
at the tool-data boundary. Prompt injection in those excerpts can still affect
a model; this design does not guarantee model instruction adherence.

## Validation before wider use

The included tests exercise the library, real CLI subprocesses, disposable Git
head changes, private local capsule lifecycle, malformed/bounded hook input,
default-off behavior, and manifest consistency. Hook events are fixtures, not a
live Codex process. POSIX permission assertions do not validate Windows ACLs.

Before enabling on real tasks, validate installation and removal in an isolated
Codex home, actual manual/automatic compaction and resume, Windows/macOS/Linux
behavior, independent worktrees, policy changes and deletion. Measure resumed
task accuracy and actual model context consumption against a matched baseline.
No token, latency, cost, or quality improvement is claimed by this preview.

## Attribution and maintained location

MIT, copyright 2026 Agoragentic. Original implementation; no upstream source was
copied. Inspired by selective verbatim retention in
https://github.com/tamaratran/fast-jev-compaction . Its hosted Jev API, deletion
policy and Claude-specific hook are not used. There is no Laya dependency.

Maintained as an independently packaged directory in the public
`rhein1/fable5-codex` repository. No separate repository or npm package publication
is implied by this source preview. The parent Fable PR provides the same core
plus its governed Memory adapter; this package works without either product.

Official contracts reviewed September 22, 2026:
https://developers.openai.com/codex/hooks and
https://developers.openai.com/codex/plugins/build . The documented post-compaction
context hook is used, not an undocumented transcript-replacement output.
