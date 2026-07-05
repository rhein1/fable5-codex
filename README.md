# Fable-5 for Codex

<p align="center">
  <img src="assets/brand/fable5-hero.png" alt="Fable-5 evidence-first review workflow" width="920">
</p>

Fable-5 for Codex is a Codex plugin that packages evidence-first engineering workflows as reusable skills. It is built for audits, deep reviews, fact checks, codebase understanding, design choices, and repo-wide sweeps where source-backed proof matters.

## What This Repo Contains

- `assets/brand/`: README and repository brand images
- `plugins/fable5-codex/`: installable Codex plugin
- `.agents/plugins/marketplace.json`: repo-local marketplace catalog
- `examples/`: prompt calls, toy repo, and expected report examples
- `evals/`: fixtures for fact-check, audit, and sweep validation
- `docs/`: method, install, architecture, and schema notes
- `scripts/validate-package.ps1`: local package validation
- `scripts/sync-personal-plugin.ps1`: copy the canonical repo plugin into the personal plugin location

## Skills

- `$fable-audit`: ranked bug, risk, and integration audit
- `$fable-deep-review`: PR or branch review with verification passes
- `$fable-fact-check`: claim-by-claim verification against source/runtime evidence
- `$fable-understand`: source-grounded explanation of how a system works
- `$fable-design-options`: design alternatives with tradeoffs and migration notes
- `$fable-sweep`: repo-wide change workflow with discovery, implementation, and verification

## Brand Assets

- `assets/brand/fable5-hero.png`: README and social-preview banner
- `assets/brand/fable5-mark.png`: compact repo mark for plugin cards or docs

## Install From GitHub

```powershell
codex plugin marketplace add rhein1/fable5-codex --ref main
codex plugin add fable5-codex@fable5-local
```

Then restart Codex if needed, start a new thread, and call a skill directly.

## Install From A Local Checkout

Register and install the repo marketplace:

```powershell
cd C:\projects\fable5-codex
codex plugin marketplace add .
codex plugin add fable5-codex@fable5-local
```

Then restart Codex if needed, open **Plugins**, choose the **Fable-5 Local Plugins** marketplace source, and confirm `fable5-codex` is installed. Start a new thread and call a skill directly:

```text
Use $fable-understand. Scope: this repository. Question: what files define the Fable-5 Codex plugin, and what are the six installed skills? Include file citations and an UNKNOWNS section.
```

The repo-local marketplace entry intentionally uses a relative source path:

```json
"path": "./plugins/fable5-codex"
```

That lets someone clone the repo without depending on a personal Windows path.

## Smoke Tests

After installing the plugin in Codex, run these smoke prompts:

```text
Use $fable-understand. Scope: C:\projects\fable5-codex. Question: what does this plugin provide, how is it installed, and what unknowns remain? Include exact file citations.
```

```text
Use $fable-fact-check. Doc: C:\projects\fable5-codex\README.md. Check every installed, supported, validated, and works claim against the files on disk.
```

```text
Use $fable-audit. Scope: C:\projects\fable5-codex. Focus: Codex plugin compatibility, path assumptions, Windows compatibility, overbroad promises, missing install steps, and schema/reporting gaps.
```

For file-only package validation:

```powershell
.\scripts\validate-package.ps1
```

If you maintain a personal install on the same machine, treat `plugins/fable5-codex/` in this repo as canonical and sync the personal copy from it:

```powershell
.\scripts\sync-personal-plugin.ps1
```

## Status

This is a v0.2 alpha repo-scoped package. Static validation and Codex CLI skill smokes are captured in `VALIDATION.md`; Codex app UI smoke remains a separate manual check before calling it production-ready.
