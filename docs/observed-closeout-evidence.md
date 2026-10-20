# Observed closeout evidence and effectiveness qualification

This additive, source-only follow-up reuses [PR #27](https://github.com/rhein1/fable5-codex/pull/27)
at `67245dd43ca1011001ba23512d440a4af97a1fe7` and the RRSI evaluator now on main
at `4e5a77e67b6b4269676977b73ae6c520e7312ef9`. It does not replace their contracts.
The original six workflow skills, authority rules and live-import refusal remain unchanged.

## Three distinct claims

| Evidence | Supported claim | Unsupported claim |
| --- | --- | --- |
| `run-closeout.mjs` | Supplied records satisfy the reviewed accounting plan. | Tests ran, work completed, evidence is independently verified, or an action is authorized. |
| `observe-check.mjs` | This host observed a particular local Node process and checked selected source bytes before/after execution and before appending its result. | The process tests the right behavior, all dependencies/history are covered, descendants stopped, or the host is isolated/authenticated. |
| RRSI synthetic comparison | The existing frozen-slot, split, denominator, cost and guard contracts behave as demonstrated. | Fable improves quality, reduces false positives, saves tokens, or has a trusted live evaluator. |

`RECORDS_SATISFIED`, `evidenceVerified: false`, and `authorityGranted: false`
retain their original meanings. Process exit zero supports a command check only;
it does not complete goals, inspect coverage, resolve findings or authorize promotion.

## Local observer API

The optional zero-dependency library lives at
`plugins/fable5-codex/scripts/observe-check.mjs`. It runs only the current Node
executable, with `shell: false`, a closed stdin and a small environment allowlist.
The first argument must be an explicitly scoped JavaScript file, or `--test`
followed by explicitly scoped JavaScript files. Inline evaluation and unscoped
entry scripts are rejected. Review the scripts and their transitive behavior
before invoking them: this library is not safe execution for adversarial code.

1. Independently review the exact check specification: `checkId`, canonical
   absolute `cwd`, ordered `args`, `sourceFiles`, `timeoutMs`, `maxOutputBytes`.
   Pin `fingerprintCheck(spec)` in host-owned state outside candidate reach.
   This digest also binds the Node path/version/platform/architecture. Never
   derive the expected digest from a candidate's new specification at admission.
2. `fingerprintSources(cwd, sourceFiles)` hashes actual file bytes, names and modes,
   including dirty bytes in that explicit scope. Set the separately held binding's
   `revision` to `sha256:<digest>`. Use the existing `createLedger(plan, binding)`.
3. Call `observeNodeCheck(ledger, binding, spec, pinnedSpecDigest)`. A mismatch
   fails before execution. The receipt records command/cwd/source/history digests,
   timestamps, monotonic duration, exit/signal, bounded stdout/stderr digests,
   output completeness and post-execution source stability. It never returns raw
   output, arguments, paths, environment values or exception messages.
4. Call `appendObservedCheck(ledger, receipt, binding)` in the same host process.
   It rechecks the original history/binding and current scoped source, derives
   the status, and calls PR #27's existing `appendEvent`. Receipts are frozen,
   single-use object identities: serialized, fabricated and replayed receipts
   cannot enter this path. Retained JSON is diagnostic evidence, not a trusted
   import capability or a signature. No cross-process authentication is claimed.

Only complete output, stable scoped source and observed exit zero produce a
passed check. Observed nonzero exit produces failure. Timeout, output overflow
or incomplete process observation produce unavailable checks. Source drift
prevents appending to the old binding. Goals, coverage and findings still require
their own reviewed events; ordinary caller-supplied events remain unverified.

Source input is limited to 1,024 explicit files and 32 MiB total, with canonical
regular-file, single-link, case-alias and traversal checks. Hashes do not discover
omitted/untracked files or dependencies. They are endpoint observations, not
continuous monitoring against transient edits or malicious filesystem writers.
`executablePathDigest` hashes the path string, not runtime binary bytes. Stronger
runtime provenance requires an independently reviewed binary pin and qualified host.

The deadline and combined 1 MiB maximum output cap cover the direct child only.
On timeout/overflow it is killed, with a bounded one-second close grace period.
`descendantCleanup: unverified` always remains explicit. CPU, memory, process
count, filesystem and network access are not contained. No OS sandbox, financial
authority, model budget, ECF grant, complete history or authenticated host is
created. Missing environment secrets do not prevent file access. Do not use this
local check adapter as RRSI's qualified host importer; that importer stays hard-off.

Run the credential-free local example:

```sh
node examples/run-closeout/observe.mjs
node --test test/observe-check.test.mjs
```

The example executes the actual closeout regression suite. Its local demonstration
policy digest is not an ECF grant. It deliberately leaves goal and review coverage
incomplete and persists no ledger, receipt or global configuration.

## Effectiveness evaluation: issue #24

Reuse `plugins/fable5-codex/experiments/rrsi/evaluator.py` rather than adding a
second scoring/accounting implementation. The executable public example below
uses `freeze_evaluation_config`, `expected_slot`, `match_arms`,
`aggregate_results`, `public_task_packet` and `enforce_heldout_attempt_cap`:

```sh
python -I -B examples/rrsi-synthetic-comparison.py
```

It asserts full denominators for missing/timeout trials, matching of seed and
model/runtime lineage, repository/family/prompt leakage rejection, sealed-packet
refusal, attempt caps, zero/unknown-cost ineligibility and non-compensatory
authority guards. Both `accepted` and `promotion_allowed` remain false. Its scores,
costs and task results are invented. The ordinary `npm test` launcher exercises it.

A real effectiveness comparison remains gated on all of the following:

- Freeze reviewed baseline/candidate bytes, the grader, private tasks, weights,
  model/CLI/runtime/tool versions, worker/effort configuration and full lineage.
  Freeze correctness/evidence tasks for findings, refutations, stale claims,
  unknowns, context retention, unauthorized-action refusal and timeout/cost reports.
  Use independent blinded adjudication of correctness and false positives;
  lexical/heading compliance and process exit zero are smoke signals only.
- Separate evolve, heldout and OOD by problem/repository family; screen exact,
  near-duplicate and semantic overlap. Public fixtures in this repository are
  not secret heldout data. Keep sealed inputs, answers, grader, feedback, history,
  policies and credentials inaccessible to proposer, critic and candidate.
  Cap qualification queries across the complete retained campaign history.
- Match both arms on model, effort, workers, tools, seeds, retries and deadlines.
  Predeclare and counterbalance trial order; start each trial with clean state.
  Repeat the frozen baseline to estimate noise before setting thresholds, retain
  every paired slot and failed attempt, and report variability and uncertainty.
- Import identity-bound host observations through a separately authenticated,
  qualified host. Retain crashes, missing outputs and timeouts as zero in the
  full denominator. Account for all analyst/proposer/critic/judge/retry/infra
  consumption; missing, unresolved or zero-token cost cannot establish savings.
- Apply authority/privacy/evidence/unsupported-claim/critical-regression guards
  independently of aggregate quality. A better average cannot offset a violation.
  Keep experiment selection separate from exact owner-authorized promotion.

No paid Codex/model trial, real optimizer run, representative private comparison,
live isolation qualification, installed-plugin change or measured effectiveness
improvement is supplied by these local examples.

## Local qualification observed on 2026-10-20

Target host: Windows, `win32 x64`, Node `v24.13.0`, npm `11.6.2`,
Python `3.14.2`, PowerShell `7.6.5`. The isolated detached worktree is based on
main `4e5a77e67b6b4269676977b73ae6c520e7312ef9`, with #27's six files reused.
No commit, branch, push, approval, merge, publication or personal-plugin change
was performed. Package validation installs only into its disposable consumer.

| Command | Observed result |
| --- | --- |
| `node --test test/run-closeout.test.mjs` | 73 total: 72 passed, 0 failed, 1 Windows symlink-privilege skip. |
| `node --test test/observe-check.test.mjs` | 16 passed, 0 failed or skipped. |
| `npm test` | 304 Node tests: 300 passed, 0 failed, 4 skipped; includes the synthetic comparison. |
| Python suites through the existing Node launcher | RRSI source 30/30 and evaluator 28/28; Laya 77 total with 1 nested platform skip. |
| `npm run validate` | Passed. |
| `pwsh -NoProfile -File scripts/validate-package.ps1` | Passed. |
| `npm run validate:artifact` | Passed in a disposable installed tarball: 300 passed, 0 failed, 4 Node skips. |
| `git diff --cached --check` | Passed for the staged patch, including reused and new files. |
| Syntax checks for the observer and local example | Passed. |
| `node examples/run-closeout/observe.mjs` | Actual check process exited 0; source stable; accounting correctly remained `INCOMPLETE`. |
| `python -I -B examples/rrsi-synthetic-comparison.py` | Passed, including positive-reported-cost unknown status, zero cost and zero tokens as separate cases. |

The four Node skips cover the non-Windows Codex integration, directly executable
Bash wrapper, and two file-symlink cases lacking Windows privileges. The nested
Python Laya suite also skips its Windows symlink case. These skips are visible
coverage gaps, not passes. Symlink checks, Linux/macOS execution, independent
runtime binary identity and process-tree containment are not newly qualified.

### Workflow Trace

- Mode: real multi-agent review; ECF contract declared here, with local source
  preparation/verification scope and no paid execution or hosted-state changes.
- Coordinator owns edits and final verification. Requested profile from the
  installed review skill: `gpt-5.6-sol` / `ultra`. Exact active coordinator model
  and effort are not exposed by this session; it was not reconfigured, so no
  Sol Ultra claim is made.
- Read-only agents: `/root/closeout_review` for accounting/input/observer review;
  `/root/evaluation_requirements` for evaluator reuse and matched/leakage controls.
  Requested workers `gpt-5.6-luna` / `medium` were unavailable; both actual workers
  used the available `gpt-6-luna` / `medium` fallback. No independent human approval
  or stronger host-isolation claim follows from their review.
- Review outcome: no actionable defect found in #27's accounting scope. The
  follow-up's command-substitution gap was reproduced, fixed through independent
  specification pinning and scoped entry scripts, and regression-tested. Source
  changes after observation, receipt fabrication and replay are also rejected.
- Remaining qualification: representative blinded effectiveness tasks, real matched
  model runs, authenticated host imports, complete all-in cost evidence, live
  containment and owner promotion. Current hosted CI covers the old #27 commit,
  not this uncommitted local patch. Memory briefing was unavailable because the
  local database was locked; GitHub state and source were checked directly.
