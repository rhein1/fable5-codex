# Changelog

## 0.4.0-alpha.2 - 2026-07-14

### Fixed

- README benchmark charts now use run-specific filenames so GitHub and CDN caches cannot retain the earlier GPT-5.5 images.
- The benchmark renderer emits both stable compatibility filenames and immutable run-specific assets.
- Package validation requires both READMEs to reference all three current run-specific charts.

## 0.4.0-alpha.1 - 2026-07-13

### Fixed

- Benchmark report citations now link to canonical repository fixtures instead of the isolated Windows execution workspace.
- Package validation now rejects absolute Windows links in the latest benchmark reports.

## 0.4.0-alpha - 2026-07-13

### Added

- GPT-5.6 Sol Ultra configuration template and setup guide.
- Sol Ultra-branded plugin screenshot and demo frame.
- Wrapper dry-run output for verifying model, effort, sandbox, and generated prompt without starting Codex.
- Sol Ultra benchmark run `20260713T234332Z`, raw outputs, quality charts, and latency chart.

### Changed

- PowerShell, Bash, and benchmark runners now default to `gpt-5.6-sol` with `ultra` reasoning.
- Plugin card and default audit prompt now identify the Sol Ultra multi-agent profile.
- Custom-agent templates explicitly inherit the coordinator's model and effort while keeping delegation depth bounded.
- Package validation checks the Sol Ultra template and wrapper defaults.

### Notes

- Ultra is an effort setting, not a separate model ID.
- The plugin cannot silently change the model or effort of an already-open Codex task.
- The matched Sol Ultra workflow benchmark improved average composite `81.7 -> 100.0` while average wall time increased `144.5s -> 344.0s`; subagents were disabled for these tiny fixtures.

## 0.3.0-alpha - 2026-07-06

### Added

- Micro ECF-style run contracts for Fable-5 Codex workflows.
- Automatic large/high-risk subagent request policy for Fable skills when the Codex runtime exposes subagents and the user has not opted out.
- Required Workflow Trace language for audit, review, fact-check, understanding, design, and sweep reports.
- Benchmark run `20260706T035611Z` with refreshed charts and raw outputs.
- npm installer metadata for `npx fable5-codex`.
- Example gallery, release checklist, community templates, and GitHub Actions validation.

### Changed

- README now leads with Codex plugin, AI code review, ECF run contract, and subagent workflow discovery terms.
- Install docs now prefer the npm installer while preserving the GitHub fallback path.

### Notes

- This package includes public Micro ECF-style contracts and reporting rules only.
- It does not include private Full ECF internals.
- Codex subagents require explicit runtime support and are only claimed when real subagent IDs or runtime-visible handles exist.
