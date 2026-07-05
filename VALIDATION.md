# Validation

Date: 2026-07-05

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
Installed plugin root: C:\Users\s8972\.codex\plugins\cache\fable5-local\fable5-codex\0.1.0
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
| Repo plugin install | Codex CLI | PASS | `codex plugin add fable5-codex@fable5-local` installed cache root |
| Codex app shows plugin | Codex app | TODO | pending restart/app discovery |
| `$fable-understand` runs | Codex app | TODO | pending smoke run |
| `$fable-fact-check` runs | Codex app | TODO | pending smoke run |
| `$fable-audit` runs | Codex app | TODO | pending smoke run |
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

The Codex app runtime smoke tests remain unproven until a fresh app thread runs the skills.

## Required Runtime Smoke Before Publishing

Run these in a fresh Codex app thread after installing `fable5-codex`:

```text
Use $fable-understand. Scope: C:\projects\fable5-codex. Question: what does this plugin provide, how is it installed, and what unknowns remain? Include exact file citations.
```

```text
Use $fable-fact-check. Doc: C:\projects\fable5-codex\README.md. Check every installed, supported, validated, and works claim against the files on disk.
```

```text
Use $fable-audit. Scope: C:\projects\fable5-codex. Focus: Codex plugin compatibility, path assumptions, Windows compatibility, overbroad promises, missing install steps, and schema/reporting gaps.
```
