# Validation

Date: 2026-07-15

## 2026-07-15 Alpha.3 Release Completeness

This corrective pass closes the post-merge release, benchmark-disclosure, and local-discovery gaps without publishing a tag, GitHub release, or npm package.

Validation commands:

```powershell
npm test
npm run validate
npm run validate:artifact
npx --yes node@18 scripts/run-tests.mjs
npx --yes node@18 scripts/validate-package.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/validate-package.ps1
bash -n plugins/fable5-codex/scripts/fable5-codex.sh
npm run pack:dry-run
git diff --check
```

Result:

```text
Node 24 source suite: 62 tests; 59 passed, 3 platform skips, 0 failed
Node 18 source suite: 62 tests; 59 passed, 3 platform skips, 0 failed
Node 24 and Node 18 package validation: passed
Installed npm tarball: tests, package validation, and installer dry run passed
PowerShell compatibility validator and Bash syntax check: passed
Codex plugin validator: passed
Codex skill validator: all six skills passed
npm pack dry run: 115 files, 1.1 MB package, qualified benchmark assets included
git diff --check: no whitespace errors; line-ending normalization warnings only
```

The new regressions prove that wrappers use the explicit `codex-cli` token even when launcher output contains an earlier semantic version, plugin digests include hidden files, `-BaselineOnly` performs no plugin CLI setup, Windows-backslash Markdown links are rejected, PNGs carry a machine-readable qualification, and transient Windows readiness-file locks do not make the run-lock test flaky.

Local app-host inventory used Codex CLI `0.144.2`. The stale enabled `fable5-codex@personal` alpha.2 install was removed, the repo-local alpha.3 plugin was reinstalled through the Codex CLI, and the final inventory contained exactly one enabled Fable-5 row. The source and cache each contained 31 files with zero path/hash differences; `.codex-plugin/plugin.json` existed and matched in both trees. The PATH npm shim remains `codex-cli 0.142.5` and was not used for this proof.

GitHub delivery used reviewed PR `#13`. PR run `29458729892` passed all six OS/Node jobs, the packed-artifact job, and the aggregate `Release gate`; Windows/Node 24 specifically passed the readiness-file regression that had failed on the prior `main` run. The approved PR was squash-merged as GitHub-verified commit `61a548673e8ff48b47fa0ceaa036c36dd7b34752`. Post-merge run `29459202047` passed the same matrix and aggregate gate on that exact `main` SHA. Main protection now enforces one approval, stale-review dismissal, last-push approval, admin enforcement, strict `Release gate` status, conversation resolution, linear history, and no force push or deletion.

The current app task had loaded both plugin versions before cleanup, so it cannot prove post-cleanup startup behavior. A fresh app task remains required to attest single-source skill discovery. No model benchmark was rerun: the pre-alpha.3 `20260713T234332Z` data was re-rendered with visible and PNG-metadata qualifications, without changing scores or timings.

## 2026-07-15 Alpha.3 Hardening

Package and plugin version:

```text
fable5-codex: 0.4.0-alpha.3
minimum Node: 18
minimum Codex CLI for GPT-5.6: 0.144.0
```

Validation commands:

```powershell
npm test
npm run validate
npm run validate:artifact
npx --yes node@18 scripts/run-tests.mjs
npx --yes node@18 scripts/validate-package.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/validate-package.ps1
bash -n plugins/fable5-codex/scripts/fable5-codex.sh
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$pluginValidator = Join-Path $codexHome 'skills\.system\plugin-creator\scripts\validate_plugin.py'
$skillValidator = Join-Path $codexHome 'skills\.system\skill-creator\scripts\quick_validate.py'
python $pluginValidator plugins/fable5-codex
python $skillValidator <each skill directory>
npm pack --dry-run --json
git diff --check
```

Result:

```text
Node 24 tests: 48 passed, 3 skipped, 0 failed
Node 18 tests: 48 passed, 3 skipped, 0 failed
Node 24 package validation: passed
Node 18 package validation: passed
Installed npm tarball validation: tests, package validator, and installer dry run passed
PowerShell compatibility validator: passed
Plugin validation: passed
Skill validation: all six passed
Windows cross-drive resume and complete-publication simulation: passed with the checkout on Z: and temporary results on C:
Isolated Codex CLI marketplace/install probe: alpha.3 enabled in a temporary CODEX_HOME and cleaned up
Bash and PowerShell syntax: passed
npm pack dry run: 110 alpha.3 entries; SECURITY.md, workflow metadata, tests, marketplace, evals, scripts, plugin, docs, and benchmark evidence included
git diff --check: no whitespace errors; line-ending normalization warnings only
```

The benchmark regression suite uses a fake Codex CLI and proves thirteen runner scenarios without model calls:

```text
successful isolated plugin arm: stripped caller secrets, passed, and remained partial/unpublished
missing explicit auth file: rejected before setup or model execution
nonzero baseline arm: failed, scored zero, and left latest artifacts unchanged
timed-out baseline arm: process tree terminated, scored zero, and temporary runtime removed
active run lock: concurrent same-id invocation rejected before setup or cleanup
linked runtime root: rejected before auth material was copied
linked runtime root ancestor: rejected before a descendant runtime directory was created
matching partial resume: preserved the completed plugin arm and ran only the baseline arm
resume to complete: final manifest separated invocation scope from all accumulated cases and modes
mismatched resume: rejected before another benchmark trial executed
changed prior summary: digest mismatch rejected before another benchmark trial executed
changed prior output: digest mismatch rejected before another benchmark trial executed
complete six-arm comparison: rendered nonblank charts, published one attested latest run, derived render-only labels from attested rows, and rejected a latest-run path outside ResultsRoot
```

The scorer unit suite also proves that an exit-zero trial with empty output fails and receives a zero score, and that the CLI accepts UTF-8 BOM-prefixed JSON from Windows PowerShell. The dependency-free Node renderer produces three nonblank 1600x900 PNGs on Node 18 and Node 24. Public summary rows omit non-public diagnostic log paths, normalize Windows/POSIX/file-URI and mixed-separator workspace paths, and attest each retained output with a SHA-256 digest.

The changed-output resume and complete-publication regressions were also run with the repository exposed through a substituted `Z:` drive while temporary benchmark results remained on `C:`. Resume resolved the recorded rooted output path, retained the exact expected-path comparison, and rejected the changed report on its SHA-256 digest before another trial executed. Complete publication rendered and republished the attested latest run through the same rooted reference without weakening the `ResultsRoot` boundary.

Codex CLI argument compatibility was checked without a model call:

```text
codex-cli: 0.144.3
--ask-for-approval never exec --help: accepted
required exec flags: sandbox, ephemeral, ignore-rules, and output-last-message present
```

Live GitHub repository settings were verified after update:

```text
private vulnerability reporting: enabled
Actions SHA pinning required: true
main branch protection: enabled
required linear history: true
force pushes: disabled
branch deletion: disabled
```

The measured benchmark was not rerun during this hardening pass. Run `20260713T234332Z` remains published with an explicit pre-alpha.3 isolation qualification; alpha.3 does not claim new model results. The same historical data was re-rendered into visibly qualified PNGs without changing scores or timings.

Sections below preserve historical machine-local evidence from earlier development passes. Absolute paths and older versions in those sections describe those runs; they are not portable instructions or current install-state claims.

## 2026-07-13 GPT-5.6 Sol Ultra Update

Package and plugin version:

```text
fable5-codex: 0.4.0-alpha.2
model: gpt-5.6-sol
reasoning effort: ultra
minimum Codex CLI for GPT-5.6: 0.144.0
```

Runtime proof used an isolated repo-local Codex CLI so the machine-wide install was not changed:

```text
isolated CLI: codex-cli 0.144.3
machine-wide CLI: codex-cli 0.142.5
Sol Ultra smoke: SOL_ULTRA_OK
```

Matched workflow benchmark:

```text
run id: 20260713T234332Z
model/effort: gpt-5.6-sol / ultra
subagents allowed: false
timeout: 600 seconds per trial
final rows: 6
final nonzero exit codes: 0
average composite: 81.7 -> 100.0 (+18.3 points)
average wall time: 144.5s -> 344.0s (2.38x)
```

Subagents were disabled because the fixtures are intentionally small and the benchmark isolates Fable workflow discipline. The first `understand-toy-repo` plugin attempt returned `Selected model is at capacity`; only that failed row was retried in place with the same configuration. See `benchmarks/results/20260713T234332Z/RUN.md`.

Validation rerun:

```powershell
npm test
npm run validate
python C:\Users\s8972\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py plugins/fable5-codex
python C:\Users\s8972\.codex\skills\.system\skill-creator\scripts\quick_validate.py <each skill directory>
bash -n plugins/fable5-codex/scripts/fable5-codex.sh
npm run pack:dry-run
git diff --check
```

Result:

```text
npm test: 15 passed, 2 skipped, 0 failed
Fable-5 package validation passed.
Plugin validation passed.
Skill is valid! (all six skills)
Bash and PowerShell syntax checks passed.
PowerShell and Bash wrapper dry-runs selected gpt-5.6-sol / ultra.
Benchmark JSON: six typed rows, matched config, all exit code 0.
Benchmark report links: canonical repo-relative destinations; no absolute Windows links.
Benchmark images: all three charts use run-specific `20260713T234332Z` filenames with hashes matching their freshly rendered stable counterparts.
npm pack --dry-run: Sol Ultra package, benchmark, and branded assets included.
git diff --check: no whitespace errors; only line-ending normalization warnings.
```

Installed plugin proof:

```text
C:\Users\s8972\.codex\plugins\cache\fable5-local\fable5-codex\0.4.0-alpha.2
C:\Users\s8972\.codex\plugins\cache\personal\fable5-codex\0.4.0-alpha.2
```

Both installed roots contain the Sol Ultra template and all six Sol-aware skills. The plugin cannot change the model or effort of an already-open Codex task; users must select Sol + Ultra or launch through the packaged wrapper/config.

## 2026-07-06 ECF / Multi-Subagent Update

Changed package version:

```text
plugins/fable5-codex/.codex-plugin/plugin.json version: 0.3.0-alpha
```

Added installable ECF resources:

```text
plugins/fable5-codex/references/ecf-run-contract.md
plugins/fable5-codex/templates/fable-ecf-run-contract.json
```

Updated command surface:

```text
$fable-audit with real Codex subagents and an ECF run contract
$fable-deep-review with an ECF run contract
$fable-fact-check with an ECF run contract
$fable-understand with an ECF run contract
$fable-design-options with an ECF run contract
$fable-sweep with an ECF run contract
```

Explicit multi-subagent prompt:

```text
Use $fable-audit with real Codex subagents and an ECF run contract. I explicitly authorize parallel subagents for this run. Scope: this repository. Focus: correctness, security, data/migrations, operations/tests, and docs-vs-reality. Spawn four independent read-only lenses: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist. Include the ECF contract and Workflow Trace.
```

Validation rerun:

```powershell
.\scripts\validate-package.ps1
python C:\Users\s8972\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py C:\projects\fable5-codex\plugins\fable5-codex
python C:\Users\s8972\.codex\skills\.system\skill-creator\scripts\quick_validate.py <each skill directory>
git diff --check
```

Result:

```text
custom agent toml ok
Fable-5 package validation passed.
Plugin validation passed: C:\projects\fable5-codex\plugins\fable5-codex
Skill is valid! (all six skills)
git diff --check: no whitespace errors; only CRLF normalization warnings
```

Wrapper and JSON syntax checks:

```text
PowerShell wrapper syntax ok
Bash wrapper syntax ok
JSON syntax ok
```

Repo marketplace state:

```text
Marketplace `fable5-local` is already added from \\?\C:\projects\fable5-codex.
Installed marketplace root: C:\projects\fable5-codex
```

Repo plugin reinstall:

```text
Added plugin `fable5-codex` from marketplace `fable5-local`.
Installed plugin root: C:\Users\s8972\.codex\plugins\cache\fable5-local\fable5-codex\0.3.0-alpha
```

Personal plugin reinstall:

```text
Added plugin `fable5-codex` from marketplace `personal`.
Installed plugin root: C:\Users\s8972\.codex\plugins\cache\personal\fable5-codex\0.3.0-alpha
```

Installed cache proof for both repo and personal installs:

```text
Version: 0.3.0-alpha
HasReference: True
HasTemplate: True
DefaultPrompt includes: Use $fable-audit with real Codex subagents and an ECF run contract on this repo. I explicitly authorize parallel subagents for this run.
```

## 2026-07-06 rk-skills Pattern Carry-Forward

Added GitHub/npx installer:

```text
package.json
bin/install.mjs
```

Supported installer modes:

```powershell
npx github:rhein1/fable5-codex#v0.3.0-alpha
npx github:rhein1/fable5-codex#v0.3.0-alpha --project
node bin/install.mjs --dry-run --no-codex-add
node bin/install.mjs --project --dry-run --no-codex-add
```

Added review and authority contracts:

```text
plugins/fable5-codex/templates/fable-review-contract.md
plugins/fable5-codex/references/ecf-run-contract.md now includes authoritySplit
plugins/fable5-codex/templates/fable-ecf-run-contract.json now includes authoritySplit
```

Validation rerun:

```text
node --check bin/install.mjs
node bin/install.mjs --dry-run --no-codex-add
node bin/install.mjs --project --dry-run --no-codex-add
.\scripts\validate-package.ps1
python C:\Users\s8972\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py C:\projects\fable5-codex\plugins\fable5-codex
quick_validate.py on each of the six skill directories
python -m json.tool package.json
python -m json.tool plugins\fable5-codex\templates\fable-ecf-run-contract.json
python -m json.tool plugins\fable5-codex\schemas\fable5.schema.json
npm pack --dry-run
```

Result:

```text
Fable-5 package validation passed.
Plugin validation passed: C:\projects\fable5-codex\plugins\fable5-codex
Skill is valid! (all six skills)
JSON syntax ok
npm pack --dry-run included bin/install.mjs, package.json, plugins/fable5-codex, assets, skills, references, schemas, and templates.
```

## Passed

File/package validation:

```powershell
.\scripts\validate-package.ps1
```

Result:

```text
custom agent toml ok
Fable-5 package validation passed.
```

Package version:

```text
plugins/fable5-codex/.codex-plugin/plugin.json version: 0.3.0-alpha
```

Plugin manifest validation:

```powershell
python C:\Users\s8972\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py C:\projects\fable5-codex\plugins\fable5-codex
```

Result:

```text
Plugin validation passed: C:\projects\fable5-codex\plugins\fable5-codex
```

Skill validation:

All six skill directories passed `quick_validate.py`:

- `fable-audit`
- `fable-deep-review`
- `fable-fact-check`
- `fable-understand`
- `fable-design-options`
- `fable-sweep`

Personal marketplace packaging:

```text
Marketplace: C:\Users\s8972\.agents\plugins\marketplace.json
interface.displayName: Personal Fable-5 Plugins
plugins[].source.path: ./plugins/fable5-codex
resolved source path: C:\Users\s8972\plugins\fable5-codex
plugins[].category: Developer Tools
```

Repo marketplace packaging:

```text
Marketplace: .agents/plugins/marketplace.json
interface.displayName: Fable-5 Local Plugins
plugins[].source.path: ./plugins/fable5-codex
resolved source path: plugins/fable5-codex
plugins[].category: Developer Tools
```

Manifest website metadata:

```text
homepage: https://agoragentic.com
interface.websiteURL: https://agoragentic.com
```

Personal plugin sync:

```text
C:\projects\fable5-codex\scripts\sync-personal-plugin.ps1
```

Result:

```text
Synced canonical plugin:
  from: C:\projects\fable5-codex\plugins\fable5-codex
  to:   C:\Users\s8972\plugins\fable5-codex
```

Codex CLI marketplace discovery:

```powershell
Get-Command codex -All | Select-Object Source
codex --version
codex plugin marketplace list
```

Result:

```text
C:\Users\s8972\AppData\Roaming\npm\codex.ps1
C:\Users\s8972\AppData\Roaming\npm\codex.cmd
C:\Users\s8972\AppData\Roaming\npm\codex
C:\Program Files\WindowsApps\OpenAI.Codex_26.623.13972.0_x64__2p2nqsd0c76g0\app\resources\codex.exe
C:\Program Files\WindowsApps\OpenAI.Codex_26.623.13972.0_x64__2p2nqsd0c76g0\app\resources\codex
codex-cli 0.142.5
```

```text
MARKETPLACE             ROOT
personal                C:\Users\s8972
openai-primary-runtime  C:\Users\s8972\.cache\codex-runtimes\codex-primary-runtime\plugins\openai-primary-runtime
openai-curated          C:\Users\s8972\.codex\.tmp\plugins
```

Repo marketplace registration:

```powershell
cd C:\projects\fable5-codex
codex plugin marketplace add .
codex plugin marketplace list
```

Result:

```text
Added marketplace `fable5-local` from \\?\C:\projects\fable5-codex.
Installed marketplace root: C:\projects\fable5-codex
MARKETPLACE             ROOT
personal                C:\Users\s8972
openai-primary-runtime  C:\Users\s8972\.cache\codex-runtimes\codex-primary-runtime\plugins\openai-primary-runtime
openai-curated          C:\Users\s8972\.codex\.tmp\plugins
fable5-local            C:\projects\fable5-codex
```

Repo plugin install:

```powershell
codex plugin add fable5-codex@fable5-local
```

Result:

```text
Added plugin `fable5-codex` from marketplace `fable5-local`.
Installed plugin root: C:\Users\s8972\.codex\plugins\cache\fable5-local\fable5-codex\0.3.0-alpha
```

Personal plugin reinstall:

```powershell
codex plugin add fable5-codex@personal
```

Result:

```text
Added plugin `fable5-codex` from marketplace `personal`.
Installed plugin root: C:\Users\s8972\.codex\plugins\cache\personal\fable5-codex\0.3.0-alpha
```

Codex CLI skill smoke:

```powershell
codex exec --sandbox read-only --cd C:\projects\fable5-codex --output-last-message runtime-smoke\01-understand.md "Use $fable-understand..."
codex exec --sandbox read-only --cd C:\projects\fable5-codex --output-last-message runtime-smoke\02-fact-check.md "Use $fable-fact-check..."
codex exec --sandbox read-only --cd C:\projects\fable5-codex --output-last-message runtime-smoke\03-audit.md "Use $fable-audit..."
```

Results:

```text
runtime-smoke\01-understand.md
runtime-smoke\02-fact-check.md
runtime-smoke\03-audit.md
```

The CLI smokes selected the Fable-5 skills and produced source-cited reports. The read-only Windows sandbox could not spawn PowerShell inside the agent (`CreateProcessAsUserW failed: 5`), so the smoke runs used filesystem and Node MCP fallbacks for repository inspection.

Post-audit fixes:

```text
- sync-personal-plugin.ps1 now computes the canonical plugin path from the checkout by default.
- sync-personal-plugin.ps1 now rejects sibling-prefix paths like C:\Users\s8972\plugins-backup\fable5-codex.
- install docs now include codex plugin marketplace add . and codex plugin add fable5-codex@fable5-local.
- reusable skill and custom-agent instructions now include no-raw-secret redaction rules.
- manifest/docs version source of truth is aligned to 0.3.0-alpha.
```

## Runtime Validation Matrix

| Check | Surface | Status | Evidence |
|---|---|---:|---|
| Source test suite | Node 24 | PASS | 62 tests; 59 passed, 3 platform skips, 0 failed |
| Compatibility test suite | Node 18 | PASS | 62 tests; 59 passed, 3 platform skips, 0 failed |
| Static package validation | Node 24, Node 18, PowerShell | PASS | `scripts/validate-package.mjs` and compatibility wrapper |
| Installed tarball validation | npm artifact | PASS | packed tests, package validator, and installer dry run |
| Plugin manifest validation | Codex validator | PASS | canonical `plugins/fable5-codex` tree |
| Six skill validators | Codex validator | PASS | `quick_validate.py` on every skill directory |
| Manifest website metadata | Static inspection | PASS | `homepage` and `interface.websiteURL` are `https://agoragentic.com` |
| Qualified historical charts | Renderer, tests, visual inspection | PASS | visible disclosure plus PNG `Qualification` metadata |
| App-host plugin inventory | Codex CLI `0.144.2` | PASS | one enabled row: `fable5-codex@fable5-local` `0.4.0-alpha.3` |
| Installed cache parity | SHA-256 tree comparison | PASS | 31 source files, 31 cache files, 0 differences, hidden manifest matched |
| Fresh app-task discovery | Codex app | PENDING | required after removing the startup-loaded personal alpha.2 install |
| Complete alpha.3 model benchmark | Isolated harness | PENDING | historical data only; no new model result claimed |
| Corrective PR and PR-specific CI | GitHub | PASS | PR `#13`; approved SHA `2e26ca9`; run `29458729892` and aggregate gate passed |
| Merged `main` verification | GitHub | PASS | verified SHA `61a548673e8ff48b47fa0ceaa036c36dd7b34752`; run `29459202047` and aggregate gate passed |
| Signed prerelease tag and GitHub release | GitHub | NOT PUBLISHED | requires clean reviewed `main` and explicit release authorization |
| npm prerelease | npm | NOT PUBLISHED | `npm whoami` is unauthenticated; no publish attempted |

## Remaining Runtime Smoke

After restarting Codex or opening a fresh app task, verify that only the repo-local alpha.3 skill source is discovered. Then run one read-only skill call and record its Workflow Trace. The existing task is not valid evidence because plugin skills are loaded at task startup.
