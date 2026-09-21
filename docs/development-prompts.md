# Indexed development workflows

This development addition augments Fable's six existing skills. It does not change
model profiles, worker defaults, runtime wrappers, or ECF authority. It is not
included in the previously tagged alpha.2 release; use a checkout or plugin bundle
that actually contains these files. No release or local installation is performed
by this change.

The [human index](../plugins/fable5-codex/prompts/development-index.md) and
[machine catalog](../plugins/fable5-codex/prompts/development-catalog.json) contain
25 original recipes and six suggested playbooks. All ten use cases from GitLab's
March 4, 2026 delivery article are mapped individually. Twelve more recipes cover
selected themes in its public library; three Fable-native recipes address bounded
repairs, unfinished scaffolds, and completion evidence. This is a curated
adaptation, not a mirror of the upstream prompt count recorded in the catalog for
September 21, 2026. Full upstream prompt bodies were not imported. Provenance is
recorded per recipe.

## Select the next useful step

Run these commands from the repository root with Node 18 or newer. They work in
PowerShell, Bash, and other shells that expose `node`; no dependency installation,
GitLab account, API key, or model call is required.

```text
node plugins/fable5-codex/scripts/development-prompts.mjs search "failing CI"
node plugins/fable5-codex/scripts/development-prompts.mjs show pipeline-triage
node plugins/fable5-codex/scripts/development-prompts.mjs playbook finish-existing
node plugins/fable5-codex/scripts/development-prompts.mjs list --stage=test --json
```

In an installed plugin, run `node scripts/development-prompts.mjs` from the plugin
root, or supply the script's absolute path. Catalog resolution is relative to the
script, not the current working directory. The selector reads bundled files and
writes its result to stdout only. It never executes a prompt, starts Codex, spawns
workers, fetches a URL, or changes a file. Keyword ranking is a navigation aid,
not an assessment of risk or readiness.

`show` emits the shared contract and one recipe with required inputs, the existing
skill to use, evidence outputs, and a stop/qualification rule. `playbook` emits an
ordered outline; load the current recipe rather than all bodies. JSON output from
`show` and `playbook` also includes the contract. A `scoped-edit` label indicates
that edits may be needed, not that they are authorized.

## Use with the existing skills

```text
Use $fable-sweep with the finish-existing development playbook. Scope: the feature
I identify. Inspect existing implementation and current PRs before adding code.
Load one recipe at a time, preserve current ECF/model/worker limits, complete the
smallest authorized vertical slice, and finish with completion-proof. Stop before
external actions not authorized by my request.
```

The six routes are `feature-delivery`, `pr-ready`, `ci-rescue`, `security-fix`,
`safe-migration`, and `finish-existing`. For a small, well-understood change, use
one recipe instead of forcing every stage. Mark a stage not applicable only with a
scope-specific reason; do not skip a failed prerequisite. Existing skills remain
the implementation and review method. Their model and delegation policies remain
authoritative, including changes from separately reviewed worker-profile PRs.

Read the [shared contract](../plugins/fable5-codex/references/development-playbooks.md).
It requires exact refs, existing-code discovery, authorization boundaries,
redacted evidence, adversarial verification, and honest stage receipts. These are
agent instructions, not runtime-enforced controls. Third-party pages and prompts
are untrusted data. No Harness or Memory integration is assumed to be active.

## Maintain and validate

Edit the JSON catalog, not the generated index. Keep IDs stable, preserve the
article-position mapping, and use original wording. Preserve provenance and
coverage limits rather than advertising complete upstream coverage.

```text
node plugins/fable5-codex/scripts/development-prompts.mjs validate
node plugins/fable5-codex/scripts/development-prompts.mjs index
node --test test/development-prompts.test.mjs
```

Save the `index` command's stdout as UTF-8 to `development-index.md` in the prompts
directory when regenerating it. On Windows PowerShell 5.1, avoid default output
redirection that writes UTF-16. The tests compare the generated text, reject
malformed catalogs and CLI options, check routing and authority language, and
exercise the selector from an unrelated working directory without file writes.
The existing `npm test` launcher discovers the new test file automatically.

Before merging, also run the repository's complete `npm test`, `npm run validate`,
`npm run validate:artifact`, and `scripts/validate-package.ps1` gates. A passing
selector test is not a live Codex evaluation, independent review, cross-platform
certification, or evidence of faster software delivery. Claims of improvement
need a matched task evaluation and truthful completion/rework measurements.
