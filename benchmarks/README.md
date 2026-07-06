# Fable-5 Benchmark

This benchmark compares the same Codex model in two modes:

- **Baseline:** `gpt-5.5` with user config ignored and no Fable-5 skill invoked.
- **Plugin:** `gpt-5.5` with the installed Fable-5 plugin, explicitly invoking the relevant `$fable-*` skill.

It is a workflow benchmark, not a broad model benchmark. The fixtures are intentionally tiny, so normal `gpt-5.5` already finds the expected issues. The measurable difference in completed cases is mostly Fable-5's discipline around explicit unknowns, coverage notes, and structured evidence. Runtime reliability matters too: timeout failures count as failed benchmark trials.

## Latest Run

- Run id: `20260706T030048Z`
- Model: `gpt-5.5`
- Reasoning effort: `xhigh`
- Timeout: 240 seconds per trial
- Command:

```powershell
.\scripts\run-benchmarks.ps1 -Model 'gpt-5.5' -ReasoningEffort 'xhigh' -TimeoutSeconds 240
```

The runner copies `evals/` and `examples/` into `tmp/benchmarks/<run-id>/` before invoking nested Codex runs. That keeps benchmark execution isolated from the source tree.

## Charts

![Fable-5 benchmark summary](../assets/benchmarks/fable5-benchmark-summary.png)

![Fable-5 benchmark metrics](../assets/benchmarks/fable5-benchmark-metrics.png)

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
| `fact-check-status` | 90.0 | 100.0 | Fable-5 added explicit unknowns and coverage notes. |
| `audit-payment-attempts` | 100.0 | 92.0 | Plugin completed under the 240s gate and found every expected issue, but cited fewer fixed evidence markers than baseline. |
| `understand-toy-repo` | 90.0 | 100.0 | Both modes found the behavior/docs mismatch; Fable-5 also preserved explicit unknowns and structured-report language. |

Average composite in the current harness: `93.3 -> 97.3` (`+4.0 pts`). The previous `20260706T004209Z` run had one plugin timeout and scored `93.3 -> 63.3`; this run did not reproduce that timeout. Treat the improvement as a reliability-plus-discipline signal on tiny fixtures, not as a broad model-quality claim.

## Raw Outputs

- `benchmarks/results/latest-summary.csv`
- `benchmarks/results/latest-summary.json`
- `benchmarks/results/20260706T030048Z/fact-check-status-baseline.md`
- `benchmarks/results/20260706T030048Z/fact-check-status-plugin.md`
- `benchmarks/results/20260706T030048Z/audit-payment-attempts-baseline.md`
- `benchmarks/results/20260706T030048Z/audit-payment-attempts-plugin.md`
- `benchmarks/results/20260706T030048Z/understand-toy-repo-baseline.md`
- `benchmarks/results/20260706T030048Z/understand-toy-repo-plugin.md`

CLI logs are ignored by git because they include local runtime noise and machine paths.
