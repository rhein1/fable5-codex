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
