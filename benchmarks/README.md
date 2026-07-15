# Fable-5 Benchmark

This benchmark compares the same Codex model and reasoning effort in two modes. The runner now defaults to the Fable-5 v0.4 profile:

- Model: `gpt-5.6-sol`
- Reasoning effort: `ultra`

Create a dedicated benchmark login first. Do not silently reuse the primary Codex home:

```powershell
$env:CODEX_HOME = Join-Path $HOME '.codex-fable5-benchmark'
codex login
Remove-Item Env:CODEX_HOME
```

Run the benchmark with that explicit auth file:

```powershell
.\scripts\run-benchmarks.ps1 -Model 'gpt-5.6-sol' -ReasoningEffort 'ultra' -TimeoutSeconds 600 -AuthFile (Join-Path $HOME '.codex-fable5-benchmark/auth.json')
```

Use `-CodexExecutable <path>` to test with an isolated current CLI without replacing a machine-wide installation. Scoring requires Node 18 or newer; use `-NodeExecutable <path>` when `node` is not the intended runtime.

Ultra is an effort setting, not a separate model ID. Keep the baseline and plugin settings matched so the benchmark measures the workflow rather than comparing different model configurations.

The current alpha.3 runner creates two separate Codex homes and an external temporary fixture workspace. The two modes are:

- **Baseline:** `gpt-5.6-sol` with ephemeral copied auth only and no marketplace, user config, or Fable-5 plugin.
- **Plugin:** the same explicit model/runtime settings plus only the repository's exact Fable-5 build, installed into a separate home and invoked through the relevant `$fable-*` skill.

It is a workflow benchmark, not a broad model or multi-agent benchmark. The fixtures are intentionally tiny, and the default runner explicitly disables subagents so proactive Ultra delegation does not add unrelated fan-out. The measurable difference is Fable-5's discipline around recall, explicit unknowns, coverage notes, and structured evidence. Use `-AllowSubagents` only for a separate benchmark designed to measure delegation. Runtime reliability matters too: timeout failures count as failed benchmark trials.

Both arms use explicit `read-only` sandboxing, approval policy `never`, ignored user/project policy rules, the same model and reasoning effort, and no inherited user configuration. The model shell receives `shell_environment_policy.inherit=none`, and the Codex worker starts from a minimal environment allowlist so caller token/key/secret variables are not inherited. The runner records the CLI version, plugin version, plugin directory SHA-256, fixture and harness digests, summary digest, source commit, dirty-worktree state, and isolation policy in `run.json`; each score row records its normalized report digest.

`-AuthFile` is mandatory for model execution so credential copying is explicit; use a dedicated benchmark login with the narrowest practical authority. Each invocation uses a GUID-named runtime outside the repository. The runner rejects symbolic links/reparse points in the runtime root or any ancestor, checks again before auth copies, applies `0700` permissions on POSIX or a current-user-only ACL on Windows, deletes both temporary `auth.json` copies before publication, and uses guarded cleanup as a fallback. A forced process kill or power loss can bypass `finally`; treat any stale `fable5-codex-benchmarks` directory under the operating-system temp directory as sensitive and remove it before sharing the machine or filesystem snapshot.

Before every retry, the runner deletes that trial's prior output and log. Any nonzero exit, timeout, or empty output receives zero rubric scores, and timeout cleanup uses a bounded termination grace period. Failed or incomplete runs keep their run-specific summary for diagnosis but cannot replace `latest-summary.*`, `latest-run.txt`, or chart images. `-SkipRuns` is rejected because it could previously treat stale output as success; resume an alpha.3 run with `-ResumeRunId` plus `-BaselineOnly` or `-PluginOnly` instead. Resume requires an exact match for the recorded model, effort, timeout, CLI, Node, plugin, fixture, harness, summary, output, and subagent configuration; completed, published, legacy, changed, or mismatched runs are rejected before a trial executes.

For a complete run, the dependency-free Node renderer prepares three stable and three immutable run-specific PNGs. A cross-process publication lock serializes charts, complete `run.json`, and `latest-summary.*`; publication is staged with rollback, and `latest-run.txt` is the authoritative pointer copied last. Post-commit staging cleanup is warning-only so it cannot downgrade an already-published run. Public summary rows include durable report paths and output digests but intentionally omit non-public diagnostic log paths. `-RenderSummaryPath` only regenerates charts when the input digest and run id match the attested currently published run.

## Latest Committed Run

- Run id: `20260713T234332Z`
- Model: `gpt-5.6-sol`
- Reasoning effort: `ultra`
- Subagents allowed: `false`
- Timeout: 600 seconds per trial
- Codex CLI: `0.144.3` in an isolated repo-local install
- Command:

```powershell
.\scripts\run-benchmarks.ps1 -Model 'gpt-5.6-sol' -ReasoningEffort 'ultra' -TimeoutSeconds 600 -CodexExecutable '.\tmp\codex-cli\node_modules\.bin\codex.ps1'
```

The alpha.3 runner copies `evals/` and `examples/` into the operating system's temporary directory, outside the repository, before invoking Codex. It also provisions the plugin from a copied local marketplace rather than the user's installed plugin cache.

The final run completed all six trials. The first `understand-toy-repo` plugin attempt returned a provider-capacity error. It was retried in place with the same model, effort, timeout, fixture, and plugin mode using the pre-alpha.3 runner's `-ResumeRunId`, without rerunning successful rows. That historical run cannot be resumed by the alpha.3 harness because it predates attested `run.json` manifests. See `benchmarks/results/20260713T234332Z/RUN.md`.

Qualification: `20260713T234332Z` was produced by the pre-alpha.3 harness. Its baseline used `--ignore-user-config`, but its plugin arm inherited the active user/plugin environment, and its workspace lived under `tmp/benchmarks/`. The six final rows all exited zero and the reported scores/timings are preserved, but this run should be read as historical workflow evidence rather than clean plugin-only causal proof. No new alpha.3 benchmark is claimed yet.

## Charts

![Fable-5 Sol Ultra benchmark summary, run 20260713T234332Z](../assets/benchmarks/fable5-benchmark-summary-20260713T234332Z.png)

![Fable-5 Sol Ultra benchmark metrics, run 20260713T234332Z](../assets/benchmarks/fable5-benchmark-metrics-20260713T234332Z.png)

![Fable-5 Sol Ultra benchmark latency, run 20260713T234332Z](../assets/benchmarks/fable5-benchmark-latency-20260713T234332Z.png)

## Scoring Rubric

Composite score:

- 60% expected concept recall
- 20% evidence marker coverage
- 10% explicit unknowns / coverage-gap language
- 10% structured report language

Expected concept recall is regex-scored against fixed fixture-specific concepts in `scripts/run-benchmarks.ps1`. This is intentionally transparent and lightweight; it should not be treated as a substitute for a larger human-reviewed eval suite.

## Result Summary

| Case | Baseline composite | Fable-5 composite | Main difference |
|---|---:|---:|---|
| `fact-check-status` | 85.0 | 100.0 | Fable-5 cited every evidence marker and made unknowns explicit. |
| `audit-payment-attempts` | 86.0 | 100.0 | Fable-5 retained full issue recall while closing evidence and coverage gaps. |
| `understand-toy-repo` | 74.0 | 100.0 | Fable-5 recovered the missing entrypoint and completed evidence/unknowns reporting. |

Average composite: `81.7 -> 100.0` (`+18.3 pts`). Expected concept recall improved `93.3 -> 100.0`, evidence markers `78.3 -> 100.0`, explicit unknowns `0.0 -> 100.0`, and structure remained `100.0 -> 100.0`.

That quality gain had a measured latency cost: average wall time increased from `144.5s` to `344.0s` (`2.38x`). Per case, baseline/Fable-5 times were `69.1s/221.9s`, `240.3s/526.4s`, and `124.1s/283.7s`.

## Raw Outputs

- `benchmarks/results/latest-summary.csv`
- `benchmarks/results/latest-summary.json`
- `benchmarks/results/20260713T234332Z/RUN.md`
- `benchmarks/results/20260713T234332Z/fact-check-status-baseline.md`
- `benchmarks/results/20260713T234332Z/fact-check-status-plugin.md`
- `benchmarks/results/20260713T234332Z/audit-payment-attempts-baseline.md`
- `benchmarks/results/20260713T234332Z/audit-payment-attempts-plugin.md`
- `benchmarks/results/20260713T234332Z/understand-toy-repo-baseline.md`
- `benchmarks/results/20260713T234332Z/understand-toy-repo-plugin.md`

CLI logs are ignored by git because they include local runtime noise and machine paths.
Committed report citations are normalized from the isolated run workspace to canonical `evals/` and `examples/` paths so they remain clickable on GitHub.
