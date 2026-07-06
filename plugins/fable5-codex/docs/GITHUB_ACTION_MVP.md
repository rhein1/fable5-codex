# GitHub Action MVP

The first GitHub Action should be read-only.

Recommended jobs:

- `fable-audit`: run on selected paths for correctness and integration risk.
- `fable-fact-check`: verify release notes or status docs.
- `fable-deep-review`: review PR diffs and changed-file callers.

Default safety posture:

```bash
codex exec --sandbox read-only \
  "Use $fable-deep-review with an ECF run contract. Review this PR. Findings first. Include Workflow Trace."
```

Do not allow the action to push commits, approve PRs, merge, deploy, publish packages, mutate secrets, or spend funds.

GitHub Actions should default to `single-agent multi-lens` unless the runner has an explicit and supported subagent runtime. Do not claim multi-agent review in CI without real subagent IDs or runtime-visible handles in the emitted Workflow Trace.
