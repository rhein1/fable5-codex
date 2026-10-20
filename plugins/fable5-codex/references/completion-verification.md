# Completion verification

Use `$fable-verify` for a task, explicit acceptance criteria, PR or branch. Quick
mode covers the requested criteria and direct evidence. Deep mode also asks for
caller tracing, negative cases and independent lenses when warranted. A deep
label never establishes that those checks happened. Preserve unavailable criteria,
assumptions and inaccessible evidence rather than inventing completion.

The versioned `schemas/completion-verification.schema.json` describes the saved
artifact. `lib/completion-verification.mjs` additionally validates cross-references,
allowed status transitions and evidence/revision bindings. This is one report
snapshot, not a new ledger or memory store. The six existing skills and their
review verdicts remain available. PR #27's closeout module still validates only
supplied records; `RECORDS_SATISFIED` never implies semantic completion.

## A working local example

From the full repository, run:

```sh
node examples/completion-verification/demo.mjs
node --test test/completion-verification.test.mjs
```

The example creates and cleans up a synthetic temporary Git repository, observes
real source bytes and a real local Node assertion, and reports the deployment
criterion as unverified. It changes no installed plugin or reviewed project.

## API for an authorized host

1. Extract requirements into `{ taskRef, requirements }`. Each requirement has
   `id`, `text`, `origin: explicit|assumption`, a reference to the original text
   in `sourceRef`, and required `methods`. Methods are `source`, `local`, `mock`,
   `hosted`, `installed`, `deployed`, `production`. The library validates this
   mapping, not the truthfulness of the extraction. Cite the user or fetched PR
   text and verify the extraction separately. Empty criteria remain unverified.
2. Call `createVerification(root, request, { repository, mode, prHead, base,
   mergeTest })`. `head` is read from Git. Snapshot hashing includes actual
   tracked/nonignored-untracked bytes, modes, deletions and index entries, even
   if Git index flags hide changes. Ignored files and external dependency trees
   are not included. Unsupported paths/links/submodules/conflicts fail closed.
   Opaque untracked directories, including embedded repositories, are rejected;
   source citations, command source files and installation source files must be
   within the bound snapshot. Ignored files cannot become unstaled evidence.
   The bound scope is limited to 1,024 files/32 MiB; larger repositories need a
   separately reviewed scoped snapshot strategy, not an invented full-coverage claim.
3. Collect source with `inspectSource(session, { path, startLine, endLine })`.
   It validates an actual line range and its bytes. A source citation does not
   establish arbitrary code semantics. For an explicitly reviewed Node script,
   use `executeNodeCheck(session, spec, independentlyPinnedSpecDigest, method)`.
   This reuses `observe-check.mjs` and `run-closeout.mjs`, accepts `local` or
   `mock`, and retains process outcome/context. A digest checks consistency; it
   is not approval. It executes current-user JavaScript without OS isolation;
   review the script and its transitive effects and honor the host sandbox.
4. Hosted checks require `hostedChecks: [{ name, appId }]` in the relevant
   requirement. Call `observeGitHubCheck(session, { checkRunId, revisionKind,
   expectedName, expectedAppId })`; it explicitly fetches that check through
   the existing authenticated `gh` CLI and verifies name, publisher app, tested
   SHA and terminal result. Supply `head`, `prHead` or `mergeTest` deliberately.
   Unrelated successful checks cannot satisfy the pinned requirement policy.
   A hosted pass satisfies the current snapshot only if the checkout is clean
   and bounded raw blob/mode hashes match the tested commit's complete file tree.
   This detects index-hidden edits too. Different-tree checks remain context,
   not passes or current blockers. CRLF/filter conversion or unprovable native
   executable modes can conservatively leave tree equivalence unverified.
   This read requires network/GitHub access; denial remains unverified.
5. `observeInstallation(session, { sourceDirectory, installationDirectory })`
   compares complete bounded regular-file inventories. Installation is separate
   from activation, release, directory approval, publication, deployment and
   production. These latter states require qualified external observations;
   arbitrary supplied records do not establish them. `suppliedEvidence` records
   unavailable/external results without promoting them to observed evidence.
6. Call `finishVerification(session, assessments)`. Each assessment supplies
   `requirementId`, `decision: satisfied|incomplete|unverified`, `reason`, live
   `evidence` objects, source `changes`, `remainingWork` and `nextAction`. The
   coordinator owns semantic judgment. A satisfied judgment requires all explicit
   methods to have current observed passes; failures cannot be overridden, mocks
   cannot satisfy production and missing methods remain unverified.
   Assessment reasons allow 2,048 characters; derived report reasons allow 2,304
   to preserve that text plus the generated missing-method explanation. Reports
   copy nested requirements and change arrays, never exposing live session state.

Repository labels and PR/base/merge role associations are caller-supplied. The
library verifies the physical root, actual checkout HEAD and local availability
of those commit objects; it does not infer a GitHub PR relationship. Resolve
current hosted PR metadata separately before supplying these fields. The artifact
explicitly labels this provenance. Do not rename a merge-test SHA as the PR head.

## Saved artifacts and resume

Save artifacts outside the reviewed tree so output does not itself change the
snapshot. Redact customer data, private transcripts, secrets and reusable grants.
Outputs contain supplied requirement text and references; the host owns ACLs,
retention and authorized persistence. The library creates no default state store.

```sh
node plugins/fable5-codex/scripts/verify-completion.mjs validate --artifact REPORT.json
node plugins/fable5-codex/scripts/verify-completion.mjs render --artifact REPORT.json
node plugins/fable5-codex/scripts/verify-completion.mjs check --artifact REPORT.json --root /canonical/repo --repository owner/repo
node plugins/fable5-codex/scripts/verify-completion.mjs handoff --artifact REPORT.json
node plugins/fable5-codex/scripts/verify-completion.mjs export-memory --artifact REPORT.json
```

`validate` validates structure, not authenticity. `render` of saved JSON leads
with unverified and labels the recorded conclusion; it cannot launder a forged
verified artifact into completion proof. In-process rendering can show the live
reasoned conclusion only while the exact artifact and checked source remain
unchanged. `check` reobserves identity and stales changed bytes/refs; matching
identity still does not authenticate saved execution or semantic conclusions.
It returns exit 1 until evidence is freshly collected. Invalid/inaccessible input
returns exit 2 with a bounded message. No command is ever read from an artifact
and executed, and source/URL references are never followed automatically.

Handoffs carry requirements, conclusions, open work and evidence links, require
revalidation, and grant no future authority. Memory export is optional data only,
with `candidate_unverified`, `verifiedDone: false`, `imported: false` and
`compatibleImporter: not_qualified`. There is no generic qualified Fable importer
today. If separately authorized, an existing Memory checkpoint can retain a
redacted summary plus artifact digest/reference and open loops. Do not auto-import,
mark done, create a Memory database or imply future GitHub reconciliation exists.

No mode proves exhaustive coverage, semantic correctness, independent human
review, sandbox containment or authority to repair/merge/deploy. Refer to
`model-support.md` for exact model/client discovery and `run-closeout.md` for
the narrower accounting contract.
