# Optional Laya playbook-selection experiment

**Source-only experiment; not enabled by installation, not in tagged alpha.2,
and not a replacement for any of Fable's six skills or its current selector.**

Laya supplies a separate, untrusted playbook suggestion in `laya-shadow` mode.
Even a high-scoring candidate NEVER replaces `selected_playbook`. An explicit
structured user choice wins; otherwise a read-only bridge maps the existing
keyword selector's first-ranked recipe into its uniquely owning playbook.
A shared, unowned, or missing recipe produces no playbook selection.

No tool execution, Codex invocation, model-setting change, config mutation,
installation, network service, checkout scan, memory read, merge, publication,
credential operation, or spending is performed by this experiment. There is no
hook or automatic activation. Python and ML dependencies are not npm dependencies.

## What is included

- `plugins/fable5-codex/experiments/laya/selector.py`: standard-library CLI for
  baseline suggestions, optional shadow observations, and matched evaluation.
- `worker.py`: a fresh CPU-only subprocess loading one reviewed local checkpoint.
- `contract.json`: six current playbooks plus `unclear`, fixed question wording,
  exact SDK/model revisions, and visibly uncalibrated experimental thresholds.
- `plugins/fable5-codex/scripts/laya-baseline.mjs`: stdin-only bridge calling the
  existing `loadCatalog` and `searchRecipes`; no reimplementation of ranking.
- `evals/laya-workflows/seed.json`: 64 ORIGINAL SYNTHETIC development cases.
  These are not user history, not a held-out benchmark, and not evidence of model
  effectiveness. Six explicit-selection cases are excluded from model metrics.
- Offline Python tests and a Node wrapper discovered by the existing `npm test`.

The first-recipe-to-playbook mapping is a NEW deterministic comparison adapter;
the old selector ranks recipes, not playbooks. Do not describe this mapping as
an existing semantic playbook ranker or as a change to `searchRecipes`.

## Try the baseline without installing Laya

From a checkout containing this experiment, with Python 3.9+ and Node installed:

```powershell
'{"task":"The CI pipeline fails in the runner setup step.","language":"en"}' | python -I -B plugins/fable5-codex/experiments/laya/selector.py suggest
```

This does not import Laya, PyTorch, or Transformers. Ordinary Fable use still
needs no Python and continues to use the original Node selector unchanged.
Use the returned `selected_playbook` only as guidance, and inspect the existing
playbook before deciding to use it:

```powershell
node plugins/fable5-codex/scripts/development-prompts.mjs playbook ci-rescue
```

Do not automatically execute commands derived from model output. Reading a
playbook does not run it, and its mode label grants no authority.

An explicit choice is a separate structured field, never an instruction parsed
out of task text:

```powershell
'{"task":"Prepare my change for review.","language":"en","explicit_playbook":"pr-ready"}' | python -I -B plugins/fable5-codex/experiments/laya/selector.py suggest --engine=laya-shadow
```

Explicit choices bypass both providers, even when the optional model is missing.
`selected_playbook` is null when the baseline abstains. A failed baseline is not
silently replaced by a Laya candidate.

## Optional model provisioning (separate owner action)

No command in the selector downloads a model or installs software. Do not run
model provisioning or pip from a Codex hook or the default Fable installer.
Use a separate virtual environment outside the repository and install the
optional `experiments/laya/requirements.txt` only after reviewing its dependency
chain. Then run the selector with that environment's Python executable.

The reviewed source pins are:

- SDK: `NandhaKishorM/laya` commit
  `573e5b62696ba441230cd6be71d593331b5d23af` (version 0.3.5 source).
- English root checkpoint: `convaiinnovations/laya` revision
  `1c5edc17a7acd8701df6fc341c0d179f1c62c982`.

The SDK requirement uses an exact Git revision. It is NOT a complete transitive
lockfile. Record a private `pip freeze` for the environment. Each model
observation records actual versions of Laya, PyTorch, Transformers, the Hub
client, Safetensors, and NumPy. Different environments must not be pooled into
one purportedly identical model run.

Acquire and review the English root artifacts at that revision through your
normal approved process. Place a plain, local, non-symlink copy outside the
repository containing only:

```text
model.safetensors
rl_agent_config.json
encoder/config.json
tokenizer/tokenizer.json
tokenizer/tokenizer_config.json
```

Additional JSON files directly under `tokenizer/` are allowed and hashed.
Do not include Hub `.cache` metadata, repository Python files, sibling model
checkpoints, or symlinks into a shared cache. No `trust_remote_code` path is used.

The upstream SDK can rewrite `tokenizer_config.json`. The worker rejects a
configuration needing that rewrite: missing/`TokenizersBackend` tokenizer class
or list-valued `extra_special_tokens`. Review any necessary normalization in a
SEPARATE local snapshot before creating the manifest. Record the normalization
with the experiment; do not misrepresent normalized bytes as byte-identical
upstream artifacts. No automatic repair or fallback download is attempted.

Generate a manifest of the reviewed local bytes. Example local paths below are
operator-supplied, not repository settings:

```powershell
$model = (Resolve-Path '<reviewed-local-model-directory>').Path
$manifest = '<private-path-outside-repository>/laya-manifest.json'
python -I -B plugins/fable5-codex/experiments/laya/worker.py manifest --model-dir "$model" --model-revision 1c5edc17a7acd8701df6fc341c0d179f1c62c982 > "$manifest"
```

The manifest records each artifact's SHA-256 and must match on every load. Its
revision provenance is `owner_asserted_local_snapshot`: it binds local bytes,
NOT a signature or independently verified upstream attestation. It does not
prove model safety. Treat the model directory and its manifest as owner-controlled
and immutable during evaluation; this is not protection from a concurrent local
attacker modifying approved files. Pin changes require an explicit code/config
review; `main`, `latest`, alternate repositories, and arbitrary revisions fail.

## Observe a Laya candidate

```powershell
'{"task":"We scaffolded the importer but never wired its public execution path.","language":"en"}' | python -I -B plugins/fable5-codex/experiments/laya/selector.py suggest --engine=laya-shadow --model-dir "$model" --manifest "$manifest"
```

`laya.status=observed` means an actual worker response passed schema/provenance
checks. `laya.candidate` is separate from `selected_playbook`. The response retains
all seven probabilities, the argmax, probability margin, calibration status,
model/SDK/manifest/question identities, observed dependency versions, and load
and inference timing. Upstream `confidence` and `act_probability` are discarded.

The fixed 0.80 probability and 0.15 margin thresholds are EXPERIMENTAL abstention
heuristics, not validated probabilities, authority checks, or a security gate.
No calibration is fitted by this PR. The English checkpoint is not assumed to
understand Fable zero-shot simply because it can accept a custom schema.

Inputs are capped at 4,096 UTF-8 bytes. Before prediction the worker checks the
actual tokenizer budgets for state, question, options, and markers. It rejects
inputs that would be silently truncated. `language=en` is caller-declared;
a conservative script filter excludes non-Latin letters, but does not detect
Spanish or other non-English text written in Latin script. Do not claim automatic
language detection, multilingual support, or semantic prompt-injection protection.

Missing dependencies, mismatched artifacts, invalid distributions, timeouts, or
worker failures leave the baseline selection unchanged and produce an explicit
failure state. Diagnostic output never includes raw provider errors or task text.
A failed `suggest` model attempt can still return a useful baseline (exit 0).

## Run and interpret evaluation

```powershell
python -I -B plugins/fable5-codex/experiments/laya/selector.py validate-dataset --dataset evals/laya-workflows/seed.json
python -I -B plugins/fable5-codex/experiments/laya/selector.py evaluate --dataset evals/laya-workflows/seed.json --split development
python -I -B plugins/fable5-codex/experiments/laya/selector.py evaluate --dataset evals/laya-workflows/seed.json --split development --engine=laya-shadow --model-dir "$model" --manifest "$manifest"
```

Reports go to stdout only. Redirect reports and private datasets OUTSIDE this
repository. The seed is entirely `development`; asking for `test` fails rather
than silently evaluating the development data. Default keyword evaluation marks
the Laya run `not_run`, with null model metrics, never a fabricated model result.
A requested shadow evaluation that has failed/missing attempts, or a failed
baseline provider, returns exit 3 with its report. Invalid input returns exit 2.

Reports include acceptable-label rate, coverage, accuracy conditional on making
a suggestion, expected-abstention recall, explicit/failed/skipped denominators,
and paired observed comparisons. A skipped non-explicit case makes a requested
shadow run partial rather than complete. Multiple acceptable labels are supported.
Provider failures are not scored as successful abstentions. Labels, case IDs,
groups, and split membership are never sent to Laya. Reports include IDs and
outcomes but not raw task text. Observations with different manifest or runtime
provenance are rejected from pooled metrics and make the run partial. The
probability values remain uncalibrated.

Every observed model case uses a fresh subprocess. Reports separately identify
all-case selector p50/p95, attempted-shadow p50/p95, and COLD observed-model
p50/p95; skipped and explicit cases do not reduce the latter. Cold figures include
baseline invocation, integrity verification, imports, and load costs. Separate
worker load/inference timings exclude some of that overhead.
No warm serving latency or memory consumption is measured; memory stays null.
This deliberately simple harness is not a long-lived server or a performance
optimization. Do not compare these timings directly to upstream GPU headlines.

Before an adoption decision, collect owner-approved, redacted representative
requests (an initial target is a few hundred, not padded synthetic variants).
Use `kind=owner_redacted`. Keep related tasks and paraphrases in the SAME group
and split; use separate `development`, `validation`, and `test` partitions.
The validator catches duplicate IDs, whitespace/case/Unicode-normalized identical text, and groups
crossing splits. Semantic near-duplicate and privacy review still require human
judgment. Fix labels and thresholds before inspecting test outcomes; do not tune
on the bundled synthetic seed and call it held-out validation.

`promotion_eligible` is always false. No report auto-enables a provider, changes
Fable configuration, or certifies readiness. Promotion requires a separate owner
review of unseen-task usefulness, correction rate, abstention, complete paired
coverage, and actual resource/maintenance cost. Retain the old selector when the
experiment does not justify extra complexity.

## Privacy and authority boundaries

Only the explicitly supplied task is classified. No repository, transcript,
Memory ledger, credential file, or external URL is scanned. Inputs must already
be redacted by the owner; this implementation is NOT a secret detector/redactor.
The subprocess environment drops caller credentials, proxy variables, Python
path injection, and Node options. The worker uses local paths, library offline
flags, no remote-code option, and temporary caches. Child stdout is bounded before
being parsed, and errors are suppressed rather than reflected. Timeout and output
limit cleanup contains the provider tree with a POSIX process group or a Windows
kill-on-close Job Object.

Temporary files/caches are implementation details, not secure erasure. Offline
library settings and path/hash checks are not an OS sandbox; use network-isolated,
least-privileged evaluation when the host's data requires it. Local inference has
compute and maintenance costs, even without a per-request API bill.

No output is evidence that work is complete, a payment is safe, a vulnerability
is absent, or an action is authorized. Existing Fable skills, coordinator/worker
profiles, ECF contracts, approvals, and verification requirements remain unchanged.
The implementation is single-process plus local inference subprocesses, not a
claim of independent Codex subagent review.

## Validation and provenance

```powershell
python -I -B test/laya_selector_test.py
node --test test/laya-workflow-selector.test.mjs
npm test
npm run validate
npm run validate:artifact
```

The Node wrapper runs the offline Python suite when Python 3.9+ is available.
It fails rather than silently skipping missing Python in hosted CI; ordinary
local installations without Python may explicitly skip that optional test.
The existing workflow is unchanged. Fake model and artifact fixtures test wrapper
behavior only. They are NOT Laya accuracy, live-model, Windows, or release proof.
Run the complete repository/packed-artifact gate before merging.

Primary sources reviewed September 22, 2026:

- https://huggingface.co/convaiinnovations/laya
- https://huggingface.co/api/models/convaiinnovations/laya
- https://github.com/NandhaKishorM/laya/blob/573e5b62696ba441230cd6be71d593331b5d23af/laya/agent.py
- https://github.com/NandhaKishorM/laya/blob/573e5b62696ba441230cd6be71d593331b5d23af/laya/common.py

The model card itself warns about base-model zero-shot limitations and confidence
calibration. No upstream performance number is adopted as a Fable result. Laya is
Apache-2.0 upstream; these wrappers are original Fable code under this repository's
license. No weights or upstream implementation bodies are redistributed here.
