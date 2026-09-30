# Governed RRSI experiments for Fable-5

Source-only implementation for [issue #24](https://github.com/rhein1/fable5-codex/issues/24).
The companion reusable domain starts at integrations PR #436, commit
`268e230c71e85858313e5e9a00c7038b53092cea`; upstream RRSI is pinned there to
`be50316e1db05914068a973f322770ef08ed7ba1`. No model is invoked by this package.

## Frozen source and candidate composition

`source.py` exports a reviewed exact Fable commit into a **new disposable Git
repository**. It copies only a fixed allowlist of the six workflow documents,
ECF/evidence contracts, schema, and model/worker profiles, directly from Git
blobs. It does not copy the installed plugin, Git configuration, credentials,
customer repositories, Memory state, benchmark answers or executable tools.
This is a frozen instruction corpus, not an installable replacement plugin.

The export records each original Git blob, SHA-256, mode and source tree in
`snapshot.json`. Keep the returned `baseline_commit` and `snapshot_sha256` in
host-owned storage outside candidate reach. A candidate's own hash is never
an authority grant. Source reading and hashing require a quiescent host-owned
checkout; these admission checks do not provide filesystem isolation.

Only these experiment paths are evolvable:

- `domains/agoragentic/harness/prompts/strategy.md`
- `domains/agoragentic/harness/prompts/context.md`

For the initial bounded experiment they contain ordered selections from a finite
host-owned vocabulary, not arbitrary instruction prose. For example:

```markdown
# Strategy
- trace-callers
- seek-refutation
- test-edge-cases
```

`compose()` returns the unchanged governing documents separately from the
host-rendered suggestions. It does not concatenate candidate prose into higher
priority instructions, execute a tool, or change model/worker configuration.
This deliberately narrows the initial search space. Broader free-form prompt
optimization needs a separate reviewed content/isolation design; delimiters
and keyword filters alone cannot establish that boundary.

Candidate verification reads the complete baseline/candidate trees and actual
worktree bytes. It rejects protected edits, extra/ignored files, deletions,
renames, mode changes, symlinks/reparse points, submodules, path aliases,
nonportable paths and drift hidden by Git index flags. A separate hypothesis
tag binds every line-level edit atom to its exact digest. Multiple changed lines
in one file consume multiple edits; prompt changes cannot claim structural
novelty. Private hypothesis prose is omitted from the resulting public packet.

## Offline CLI

Python 3.10+ and Git are required. All commits must be full lowercase Git SHAs.
Use a clean source checkout and an unused destination outside that checkout:

```sh
python -I -B plugins/fable5-codex/experiments/rrsi/cli.py snapshot \
  --source /path/to/clean/fable-source --commit FULL_REVIEWED_COMMIT \
  --destination /path/to/disposable/experiment
python -I -B plugins/fable5-codex/experiments/rrsi/cli.py inspect \
  --repo /path/to/disposable/experiment --baseline EXPORTED_BASELINE_COMMIT \
  --candidate CANDIDATE_COMMIT --snapshot-sha256 HOST_SNAPSHOT_SHA256
```

`inspect` computes real diff atoms without authorizing a run. `bind` additionally
takes `--edits <private-json-file>` and `--edit-budget <integer>`; each edit must
have exactly `diff_sha256`, `component: "prompt"`, `hypothesis_id: "hyp-..."`,
and a bounded `hypothesis` string. `compose` takes the same source binding plus
`--skill audit|deep-review|fact-check|understand|design-options|sweep`.

When creating additional candidate worktrees, preserve the exported bytes:
`git -c core.autocrlf=false worktree add --detach <candidate-dir> <baseline>`.
Windows automatic line-ending conversion otherwise changes protected worktree
bytes and admission correctly rejects the checkout as drifted. Keep all such
worktrees inside the disposable experiment area; none may execute candidate code
until a qualified host separately provides isolation and authority.

## Independent evaluation

`evaluator.py` provides the host-side frozen-suite and offline result contracts.
Synthetic unit-test tasks exercise factual/evidence assertions; they are public
fixtures and must never be represented as secret held-out tasks or measured
Fable performance. The existing lexical/heading benchmark stays a smoke test.
Live observations require a separately authenticated, qualified host importer;
caller-authored JSON and hashes cannot establish trusted runtime evidence.

`freeze_evaluation_config()` freezes uniform assertion weights, model identity,
worker/deadline/retry limits, the sealed-evaluation cap, source excerpts and
grader definitions. Its evaluator digest hashes the actual Python source bytes.
Tasks require repository and problem-family separation; exact and near-duplicate
prompt screening is an additional deterministic check, not proof against all
semantic duplication. Every assertion names an exact typed fact and a citation
whose line digest must match the frozen host source excerpt. This grades known
facts and evidence references; it does not infer arbitrary code semantics.

`public_task_packet()` exposes evolve prompts and source excerpts without the
assertions. Held-out and OOD packets remain sealed. `expected_slot()` binds an
evaluation slot to both Git commits, the snapshot, frozen suite/model/runtime,
arm, task, trial, and seed. `aggregate_results(..., synthetic=True)` recomputes
scores from structured results rather than accepting caller scores. It counts
every attempt's integer micro-USD cost and policy tokens, selects the final
attempt per fixed slot, and keeps missing slots in the denominator. Unknown or
zero cost, unsafe attempts, deadline overruns and incomplete trials cannot be
comparable. `accepted` and `promotion_allowed` always remain false. Live imports
and live aggregation refuse even a caller-provided `authenticated: true` envelope.

The host must retain the complete campaign history outside candidate reach for
held-out caps and account for analyst, proposer, critic, judge, retry and
infrastructure overhead in addition to these task-attempt totals. The companion
offline host budget model exercises that cumulative accounting; neither module
is durable production accounting. A private representative task suite and
independent human adjudication for free prose remain qualification work.

## Verification and remaining qualification

```sh
python -I -B test/rrsi_source_test.py -v
python -I -B test/rrsi_evaluator_test.py -v
npm test
npm run validate
npm run validate:artifact
```

The existing Node test runner includes both Python suites and fails if Python is
unavailable. No public default, installed workflow or benchmark runner changes.
Tests use disposable synthetic repositories and observations. No paid search,
real Codex evaluation, host containment, Memory ingestion, owner promotion,
installation, reload, rollback observation, merge or deployment is claimed.
P2/P4 orchestration and Memory source contracts remain in the companion
integrations workstream. OpenShell remains optional and independently gated.
