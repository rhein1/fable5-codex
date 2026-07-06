# Changelog

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
