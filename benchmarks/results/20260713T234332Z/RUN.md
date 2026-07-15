# Benchmark Run 20260713T234332Z

## Configuration

- Model: `gpt-5.6-sol`
- Reasoning effort: `ultra`
- Subagents allowed: `false`
- Timeout: 600 seconds per trial
- Codex CLI: `0.144.3`, installed under the ignored repo-local `tmp/codex-cli` path
- Comparison: baseline with user config ignored versus explicit Fable-5 invocation in the active installed-plugin environment

```powershell
.\scripts\run-benchmarks.ps1 -Model 'gpt-5.6-sol' -ReasoningEffort 'ultra' -TimeoutSeconds 600 -CodexExecutable '.\tmp\codex-cli\node_modules\.bin\codex.ps1'
```

The fixtures are intentionally small. The runner disabled subagents to isolate workflow discipline rather than measure multi-agent performance.

The committed report citations point to the canonical repository fixtures. The runner normalizes only Markdown link destinations from the isolated execution workspace; report prose, scores, and timings are unchanged.

## Qualification Note

This run predates the alpha.3 benchmark hardening. The baseline passed `--ignore-user-config`, while the plugin arm inherited the user's active Codex configuration and installed plugins. The workspace was also a copy under the repository's ignored `tmp/benchmarks/` directory. All final outputs and timings below came from successful exit-code-zero trials, but the environment difference means these results are historical workflow evidence, not clean causal proof that Fable-5 alone produced the measured delta. The alpha.3 harness now uses separate newly created Codex homes, an external temporary workspace, an exact plugin digest, and fail-closed publication; a fresh complete run is required for new charts.

The first `understand-toy-repo` plugin attempt returned `Selected model is at capacity`. The successful baseline rows and other plugin rows were retained. Only the failed row was retried with the same configuration:

```powershell
.\scripts\run-benchmarks.ps1 -Model 'gpt-5.6-sol' -ReasoningEffort 'ultra' -TimeoutSeconds 600 -CodexExecutable '.\tmp\codex-cli\node_modules\.bin\codex.ps1' -ResumeRunId '20260713T234332Z' -CaseId 'understand-toy-repo' -PluginOnly
```

All six final rows have exit code `0`. Provider capacity is external runtime noise, but disclosing the retry prevents the committed result from implying a single uninterrupted batch.

## Results

| Case | Baseline | Fable-5 | Baseline time | Fable-5 time |
|---|---:|---:|---:|---:|
| `fact-check-status` | 85.0 | 100.0 | 69.1s | 221.9s |
| `audit-payment-attempts` | 86.0 | 100.0 | 240.3s | 526.4s |
| `understand-toy-repo` | 74.0 | 100.0 | 124.1s | 283.7s |

Average composite improved `81.7 -> 100.0` (`+18.3` points). Average wall time increased `144.5s -> 344.0s` (`2.38x`).
