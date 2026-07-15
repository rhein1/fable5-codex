# Changelog

## 0.4.0-alpha.3 - 2026-07-15

### Added

- Cross-platform Node package validation on Windows, macOS, and Linux with Node 18 and Node 24 CI coverage.
- Wrapper and benchmark regression tests, including a complete fake-CLI comparison that renders and publishes charts without model calls.
- Cross-platform explicit test enumeration and installed-tarball validation for the npm artifact.
- Dependency-free Node benchmark chart rendering for Windows, macOS, and Linux.
- Dependabot configuration and repository ownership metadata.

### Fixed

- The installer now rejects unknown, split-value, and duplicate options, including invalid combinations with help, before selecting or mutating a destination.
- PowerShell and Bash wrappers now preflight the Codex executable and reject GPT-5.6 on CLI versions older than `0.144.0`.
- Bash wrapper flags can appear before or after positional arguments without being misread as focus text.
- Benchmark runs now use separate temporary Codex homes, an external fixture workspace, a read-only sandbox, ignored policy rules, an exact plugin digest, and ephemeral copied auth material.
- Benchmark model processes now receive a minimal environment and `shell_environment_policy.inherit=none`; unique private runtimes remove copied auth before publication and reject links across the full runtime ancestor chain.
- Benchmark retries delete stale output first; nonzero exits, timeouts, and empty outputs score zero; failed or incomplete runs cannot replace `latest-*` summaries or charts.
- Benchmark resume requires a matching schema-2 run attestation bound to prior summary and output digests.
- Benchmark process cleanup is bounded, report path normalization covers Windows/POSIX links and plain paths, render-only mode is limited to the attested latest run, and chart/manifest/latest publication is staged and rollback-protected with `latest-run.txt` written last.
- Render-only chart labels are derived from the attested summary instead of a caller-supplied model override.
- Concurrent benchmark runs are serialized for per-run mutation and latest publication; post-commit staging cleanup cannot downgrade a published manifest.
- GitHub Actions dependencies are pinned to full commit SHAs.
- CI whitespace checks compare committed PR/push ranges instead of an always-clean checkout.
- CI now exposes one aggregate `Release gate` over the six-job matrix and packed-artifact job.
- Release instructions now require a clean, CI-green `origin/main` before creating a tag, and issue reports prompt for the current package version.
- The npm tarball now includes the repo marketplace, eval fixtures, benchmark/validation scripts, and private vulnerability reporting policy.

### Notes

- The committed `20260713T234332Z` charts remain the latest measured result, but they were produced by the pre-alpha.3 harness and are retained as historical workflow evidence rather than clean plugin-only causal proof.
- No new model benchmark is claimed by this release until a complete alpha.3 isolated run succeeds.

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
