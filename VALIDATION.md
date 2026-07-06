# Validation

Date: 2026-07-06

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
| Static package validation | PowerShell validator | PASS | `scripts/validate-package.ps1` |
| Plugin manifest validation | Codex validator | PASS | `validate_plugin.py C:\projects\fable5-codex\plugins\fable5-codex` |
| Six skill validators | Codex validator | PASS | `quick_validate.py` on each `SKILL.md` directory |
| Repo marketplace path resolution | Static inspection | PASS | `.agents/plugins/marketplace.json` uses `plugins[].source.path` = `./plugins/fable5-codex` |
| Personal marketplace path resolution | Static inspection | PASS | `C:\Users\s8972\.agents\plugins\marketplace.json` resolves to `C:\Users\s8972\plugins\fable5-codex` |
| Manifest website metadata | Static inspection | PASS | `homepage` and `interface.websiteURL` are `https://agoragentic.com` |
| Personal plugin sync from repo canonical | PowerShell helper | PASS | `scripts/sync-personal-plugin.ps1` |
| CLI marketplace list | Codex CLI | PASS | `codex-cli 0.142.5`; `codex plugin marketplace list` includes `personal` |
| Repo marketplace registration | Codex CLI | PASS | `codex plugin marketplace add .` registered `fable5-local` at `C:\projects\fable5-codex` |
| Repo plugin install | Codex CLI | PASS | `codex plugin add fable5-codex@fable5-local` installed `0.3.0-alpha` cache root |
| Personal plugin reinstall | Codex CLI | PASS | `codex plugin add fable5-codex@personal` installed `0.3.0-alpha` cache root |
| `$fable-understand` runs | Codex CLI | PASS | `runtime-smoke/01-understand.md` |
| `$fable-fact-check` runs | Codex CLI | PASS | `runtime-smoke/02-fact-check.md` |
| `$fable-audit` runs | Codex CLI | PASS | `runtime-smoke/03-audit.md` |
| Codex app shows plugin | Codex app | TODO | pending restart/app discovery |
| `$fable-sweep` fixture edit workflow runs | Codex app | TODO | pending smoke run |

## Remaining Runtime Smoke

Codex CLI marketplace discovery and plugin install now pass through the npm CLI shim.

The earlier failed CLI check:

```powershell
codex plugin marketplace list
```

failed before plugin discovery because Windows denied execution of:

```text
C:\Program Files\WindowsApps\OpenAI.Codex_26.623.13972.0_x64__2p2nqsd0c76g0\app\resources\codex.exe
```

Observed failure:

```text
Access is denied.
```

This is a local Codex CLI launch blocker, not evidence that the plugin package is invalid.

That blocker is resolved for the current shell because `codex` now resolves to:

```text
C:\Users\s8972\AppData\Roaming\npm\codex.ps1
```

Codex CLI runtime smoke has passed for `$fable-understand`, `$fable-fact-check`, and `$fable-audit`. Codex app UI discovery remains unproven until a fresh app thread runs the skills.

## Remaining Runtime Smoke

Optional final app UI smoke after installing `fable5-codex`:

```text
Use $fable-understand. Scope: C:\projects\fable5-codex. Question: what does this plugin provide, how is it installed, and what unknowns remain? Include exact file citations.
```

```text
Use $fable-fact-check. Doc: C:\projects\fable5-codex\README.md. Check every installed, supported, validated, and works claim against the files on disk.
```

```text
Use $fable-audit. Scope: C:\projects\fable5-codex. Focus: Codex plugin compatibility, path assumptions, Windows compatibility, overbroad promises, missing install steps, and schema/reporting gaps.
```
