# Repair and qualify a connected workflow

Use this guide for repeated launcher, pipeline, generated-package or timed-handoff
failures, especially when a later attempt needs a person, credentials, provider
usage or a one-use operation. Ordinary edits do not need this whole procedure.
Scale the work to the demonstrated failure and reuse unchanged, verified evidence.

Enter through `fable-sweep` for authorized repair, `fable-deep-review` for independent
review, or `fable-verify` for read-only completion assessment. This guide adds no
execution authority, daemon, retry loop, provider integration or memory store.
Preserve the user's existing scope and approvals; do not restart paused work or
compete with its designated repair owner.

## Establish the route and the next missing fact

Identify the selected entrypoint, generators, generated files, manifest, imported
dependencies, process boundaries, reviewers, input/output handoffs and terminal
receipt. Follow actual path resolution and native child reads; similarly named
source files and an in-process overlay may not be what a child executes.
Record the exact source revision and dirty bytes, not just a version string.

Name the current failing stage and its smallest unresolved fact. For example,
capture the bounded, sanitized stderr of the graph child that exited before
speculating about the provider. Separate target defects, runner/tool failures,
missing evidence and rejected authority. Establish one owner for shared writes;
delegate disjoint investigations or independent review rather than duplicate runs.

Use one current checkpoint in the authorized evidence location, with links to
immutable raw results. Record: selected identities; current blocker; measured
versus inferred cause; changes; validation; review findings; run state; consumed
operations; remaining unknowns; next action. Reuse [run-closeout.md](run-closeout.md)
when durable accounting is requested. Do not create a new status system or write
to the user's memory store without its required authorization.

## Measure before changing the route

Trace phase wall time, CPU/self time, allocation pressure, child startup, I/O,
polling and reviewer/transport latency separately. Use monotonic elapsed time for
durations and the required absolute clock for expiry. A CPU percentage is not a
percentage of total elapsed time; sampled hotspots are not exact call counts.
Record machine load, instrumentation overhead and the measured interval.

Build the smallest diagnostic that answers the missing fact. Prefer the real
selected sources with synthetic effects over a parallel implementation. Keep
trace switches opt-in and bounded; sanitize logs before retaining them. A process
exit or handled timeout alone does not establish descendant termination.

When authorized, diagnostic overlays and compile-time substitutions can test a
candidate before packaging. Label them **non-qualifying**: integrity reads seeing
the published bytes while execution uses substituted bytes cannot attest the
executed source. Scripted reviewers can locate failures and measure mechanics;
they do not prove genuine independent review or its latency.

Before running a diagnostic, verify isolation covers native children as well as
the parent: disposable output roots, synthetic inputs and replacement or denial
of provider, credential, signing and mutation effects. A redirected write API is
not OS isolation. Do not run if the diagnostic can reach operational effects
outside the authorization. Do not copy real credentials into a rehearsal.
Do not touch operational claims, permits or journals to make tests pass. A scratch
diagnostic ID is distinct from a qualifying or operational one-use identity.

## Repair the producer and test behavior

For generated trees, repair the owning generator or template and regenerate its
dependent outputs. Do not hand-edit generated files and then patch scattered
hashes until they appear consistent. For exact text transformation plans, pin the
input, require each anchor exactly once, check syntax and prove the inverse edits
restore the original bytes. Use an AST or the project's generator when appropriate;
text-rewrite plans are not a universal requirement for normal source edits.

Where a deterministic generator exists, first establish that the baseline still
reproduces the retained manifest and files. Explain every candidate difference:
semantic change, identity/path rotation, derived hash or intentionally preserved
compatibility. Inspect unresolved imports and dynamically constructed paths.
Token counts and hash substitutions alone do not establish semantic equivalence;
retain provenance for old-to-new mappings and verify the complete selected closure.
If a missing generation step must be reconstructed, demonstrate baseline
reproduction before using it to build a successor.

Add focused tests for the demonstrated risks. Execute actual input construction,
imports, handoffs and both success/failure paths; checking that a string or digest
changed is insufficient. For critical guards, use small mutants that remove or
miswire the fix. A behavioral assertion must reject each non-equivalent mutant;
an expected-hash assertion alone is not a behavioral kill. Report equivalent
mutants and surviving gaps honestly. Avoid mutation campaigns for trivial edits.

For polling repairs, measure redundant work and preserve cancellation/revocation
semantics, fresh checks at action boundaries, source-change detection and a bounded
maximum response delay. Exercise cancellation during waits and child activity.
Do not silently extend deadlines, reduce required reserves or replace fresh checks
with cached success. A change to an owner-imposed limit needs the applicable owner
decision. Keep CPU savings separate from measured end-to-end elapsed improvement;
a quiet-machine success alone is weak evidence for a load-sensitive route.

## Review the assembled candidate

Give an independent reviewer the task, exact final sources/diff, relevant callers,
invariants and raw evidence. Let it form its own conclusions before comparing
author claims. It may execute authorized isolated checks or mutants in its own
scratch scope. Record the actual reviewer identity, inspected version, findings
and dispositions. Never prefill a verdict or use the author's transcription as
proof that an independent review occurred.

Integrate related fixes before qualifying the package. Review their composition
and changed dependencies; individually accepted components do not establish that
the combined route works. Resolve blocking findings and explicit review conditions
before promotion. An `ACCEPT_WITH_CHANGES` label is not an unconditional pass.
Reuse unchanged reviews where their identity and scope still match; new changes
justify targeted follow-up rather than repeating every finished test or review.

## Stage, publish locally and preserve recovery

Use this section only when packaging is required by the selected workflow and
local publication is authorized. Stage outside the shared or operational tree.
Inspect the exact publication delta and its review before replacing shared files.
For run-bound packages derive a fresh identity and nonce through the owning
generator, updating the full chain. Never rewrite an old identity into spent
claims or replay an ended run. A diagnostic is not exempt if it touches those
claims or performs actual one-use effects.

Quiesce the affected readers and writers, including native guards. Back up every
replaced file and the prior manifest with verified bytes. Preserve old receipts
and evidence, document restoration, and verify the expected prestate before
applying changes. Prefer existing staging/publication tools to a new framework.
Read back the full new manifest and affected closure. Per-file replacement is not
an atomic transaction; a partial failure requires reconciliation of exact paths
before an authorized recovery. Do not automatically replay mutations.

Hash, review and test the final assembled bytes and generated bindings. Do not
publish a package known to omit fixes required by its qualifying route. If a
diagnostic-only package is useful, label it explicitly and keep it separate from
qualifying identity and readiness claims.

## Qualify the complete route before involving the owner

Exercise the exact selected final package continuously through its required stage
list with real elapsed time and the required independent reviewer actions. Record
phase timings, remaining margins, child outcomes and terminal evidence. Use
representative load and explain variation; one passing run is not a universal
timing guarantee. Component suites, scripted verdicts, shortened supervisors,
compile-time swaps and partial diagnostics cannot establish this gate.

Provider/private effects remain simulated in local qualification. Keep synthetic
identities structurally unable to authorize an operational action. When the
workflow has an operational admission gate, demonstrate through its original code
in an isolated harness that the **same rehearsal packet** is rejected before
claims, credentials, signing, clients or writes are reached. Deny/instrument those
effects; do not launch a connected production installer as a negative test.
An unrelated negative fixture is not proof about the held rehearsal packet.

Do immutable reads, source assembly, review-method preparation, tooling checks
and local qualification before starting freshness clocks or asking the owner to
wait for MFA. Leave only genuinely action-time evidence and required local human
input for the attended phase. Budget review, transfer and human-response latency
as well as execution; provide a visible status and enough time under the approved
limits. Report insufficient timing instead of repeatedly opening doomed windows.

Do not re-run an unchanged failed route without a concrete changed hypothesis,
fix or environment condition. Reuse finished evidence that still matches. Honor
existing authorized recovery for bounded read-only failures; do not invent a new
approval ceremony for every harmless local diagnostic. Mutation uncertainty, spent
one-use authority and explicit stop rules require reconciliation and the applicable
new scope. A source repair does not itself authorize another paid attempt.

## Report what the result establishes

Keep these claims separate: diagnostic progress; candidate tests; final package
identity/review; full local rehearsal; supported installation; live runtime;
business or financial trial. Local success proves only the exercised synthetic
route. Record real children versus modeled children and unknown descendant state.
No ETA should be presented as measured until the evidence supports it.

Finish with the root cause proved or still inferred, changed producers/outputs,
test and mutation results, final-package review, complete-route result and timing,
cleanup, remaining gaps and the smallest next action. Keep sensitive local
artifacts out of public plugin examples. The reusable workflow is public guidance;
private project evidence and approval records stay in their authorized locations.
