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
cd C:\projects\fable5-codex
codex plugin marketplace add .
codex plugin add fable5-codex@fable5-local
codex plugin list
```

For a published GitHub repo, use the Git-backed marketplace path:

```powershell
codex plugin marketplace add rhein1/fable5-codex --ref main
codex plugin add fable5-codex@fable5-local
```

Start a new Codex thread after install. Use this prompt when you want Fable-5 styled multi-subagent work:

```text
Use $fable-audit with real Codex subagents and an ECF run contract. I explicitly authorize parallel subagents for this run. Scope: this repository. Focus: correctness, security, data/migrations, operations/tests, and docs-vs-reality. Spawn four independent read-only lenses: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist. Include the ECF contract and Workflow Trace.
```

The installed skill will use real subagents only when Codex exposes a subagent tool in that runtime. If not, it should report `single-agent multi-lens` with a no-subagent reason.

The packaged CLI wrappers can generate the same prompt:

```powershell
.\plugins\fable5-codex\scripts\fable5-codex.ps1 -Mode audit -Scope . -Focus "correctness, security, data, operations, tests, and docs-vs-reality" -Subagents
```

```bash
./plugins/fable5-codex/scripts/fable5-codex.sh audit . "correctness, security, data, operations, tests, and docs-vs-reality" --subagents
```

## Personal Install

The checked-out repo copy is canonical. In this checkout that path is:

```text
C:\projects\fable5-codex\plugins\fable5-codex
```

For a personal marketplace, use:

```text
~/.agents/plugins/marketplace.json
```

and point the entry at wherever the local plugin folder lives, using a relative `./` path from the marketplace root. On this machine, the personal MVP uses:

```text
C:\Users\s8972\plugins\fable5-codex
```

through:

```json
"path": "./plugins/fable5-codex"
```

To avoid drift, regenerate the personal plugin copy from the repo copy:

```powershell
.\scripts\sync-personal-plugin.ps1
```

That keeps the public/repo plugin as the source of truth while preserving the normal personal marketplace layout.

## Runtime Validation

After installing, restart Codex and start a new thread before testing the skills. File-level validation can confirm package shape, but only an installed Codex session proves runtime discovery.
