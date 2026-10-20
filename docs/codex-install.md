# Codex Install Notes

This repo is packaged as a repo-local Codex marketplace.

## Repo-Scoped Install

The marketplace lives at:

```text
.agents/plugins/marketplace.json
```

The plugin lives at:

```text
plugins/fable5-codex
```

The marketplace entry uses:

```json
"path": "./plugins/fable5-codex"
```

Codex resolves that path from the marketplace root for the repo, so cloned copies do not need personal machine paths.

Register and install from the local repo:

```powershell
cd <path-to-fable5-codex>
codex plugin marketplace add .
codex plugin add fable5-codex@fable5-local
codex plugin list
```

For a published GitHub repo, use the Git-backed marketplace path:

```powershell
codex plugin marketplace add rhein1/fable5-codex --ref v0.4.0-alpha.2
codex plugin add fable5-codex@fable5-local
```

## npx Installer

For a live copy-based personal install from GitHub:

```powershell
npx github:rhein1/fable5-codex#v0.4.0-alpha.2
```

The npm package metadata is ready, but npm publishing requires an authenticated npm account. After publish, this shorter command will work:

```powershell
npx fable5-codex
```

That command copies the packaged plugin into:

```text
~/plugins/fable5-codex
```

and writes or updates:

```text
~/.agents/plugins/marketplace.json
```

On Windows, automatic Codex invocation is skipped so installer-controlled paths are never passed through a command shell. Activate the copied plugin with the exact command printed by the installer:

```powershell
codex plugin add fable5-codex@personal
```

On macOS and Linux the installer runs that command automatically. For `--project` on Windows, change to the target root and run `codex plugin marketplace add .` followed by the printed plugin-add command.

For a project-local marketplace in the current directory:

```powershell
npx github:rhein1/fable5-codex#v0.4.0-alpha.2 --project
```

After npm publish:

```powershell
npx fable5-codex --project
```

Use `--no-codex-add` to only copy files and write marketplace metadata. If a copied plugin destination already exists, review it and pass `--force` explicitly to replace it. The installer rejects marketplace names with unsafe characters or non-string JSON types and refuses destination paths that resolve outside the selected personal/project root.

Supported installer options are `--project`, `--dry-run`, `--force`, `--no-codex-add`, `--marketplace-name=<name>`, and `--help`/`-h`. Unknown options, split marketplace-name values, and duplicate options are rejected before target selection, even when help is requested.

Start a new Codex thread after install. Use this prompt when you want Fable-5 styled multi-subagent work:

```text
Use $fable-audit with real Codex subagents and an ECF run contract. I explicitly authorize parallel subagents for this run. Scope: this repository. Focus: correctness, security, data/migrations, operations/tests, and docs-vs-reality. Spawn four independent read-only lenses: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist. Include the ECF contract and Workflow Trace.
```

The installed skill will use real subagents only when Codex exposes a subagent tool in that runtime. If not, it should report `single-agent multi-lens` with a no-subagent reason.

## Select A Supported Model Profile

Use the [shared model support policy](../plugins/fable5-codex/references/model-support.md). Balanced/deep prefer GPT-6.1 Sol medium/max and bounded GPT-6 Luna workers only where the exact client supports them. An npm shim and native desktop executable can expose different catalogs; select the executable deliberately and do not equate catalog presence with entitlement.

The Luna worker-default keys require Codex CLI `0.152.0` or newer. The wrappers check the selected executable before launching Codex and fail with an upgrade message when it is too old.

Both wrappers default to `codex` and resolve one absolute launcher for version,
catalog and execution. Windows npm launchers are supported without `cmd /c` or an
execution-policy change; explicit native executable overrides remain exact.
See the shared model policy for launcher selection and unsupported batch files.

The compatibility-named deep template illustrates preferences; check support before applying any configuration. Wrappers resolve profiles without overwriting user settings:

```toml
model = "gpt-6.1-sol"
model_reasoning_effort = "max"

[agents]
default_subagent_model = "gpt-6-luna"
default_subagent_reasoning_effort = "medium"
max_concurrent_threads_per_session = 3
max_depth = 1
```

Codex Ultra orchestration is not an OpenAI API reasoning-effort value. See [model/client boundaries](sol-ultra.md). `-Profile` / `--profile=` selects balanced, deep or economical; explicit overrides remain supported.

The packaged CLI wrappers can generate the same prompt:

```powershell
.\plugins\fable5-codex\scripts\fable5-codex.ps1 -Mode audit -Scope . -Focus "correctness, security, data, operations, tests, and docs-vs-reality" -Subagents
```

Use `-CodexExecutable <path>` when the current CLI is installed somewhere other than `PATH`. Override workers with `-SubagentModel` and `-SubagentReasoningEffort` only when needed.

```bash
bash ./plugins/fable5-codex/scripts/fable5-codex.sh audit . "correctness, security, data, operations, tests, and docs-vs-reality" --subagents
```

Use `--codex-executable=<path>` or `FABLE5_CODEX_EXECUTABLE=<path>` to select a non-default CLI. Worker overrides are `--subagent-model=`, `--subagent-reasoning=`, `FABLE5_SUBAGENT_MODEL`, and `FABLE5_SUBAGENT_REASONING_EFFORT`. Bash flags may appear before or after the positional mode, scope, and optional focus.

## Personal Install

The checked-out repo copy is canonical. Its plugin path is:

```text
<repo>\plugins\fable5-codex
```

For a personal marketplace, use:

```text
~/.agents/plugins/marketplace.json
```

and point the entry at wherever the local plugin folder lives, using a relative `./` path from the marketplace root. On Windows, a typical personal copy is:

```text
%USERPROFILE%\plugins\fable5-codex
```

through:

```json
"path": "./plugins/fable5-codex"
```

Verify the actual installed source and version using `codex plugin list --json`. Before updating, back up that package and affected configuration, compare customizations and test an isolated upgrade. See [upgrade, rollback, privacy and activation](completion-upgrade.md). The supported sync path is:

```powershell
.\scripts\sync-personal-plugin.ps1
```

That keeps the public/repo plugin as the source of truth while preserving the normal personal marketplace layout.

## Runtime Validation

After installing, restart Codex and start a new thread before testing the skills. File-level validation can confirm package shape, but only an installed Codex session proves runtime discovery.
