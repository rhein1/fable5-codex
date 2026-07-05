# GitHub Action MVP

The first GitHub Action should be read-only.

Recommended jobs:

- `fable-audit`: run on selected paths for correctness and integration risk.
- `fable-fact-check`: verify release notes or status docs.
- `fable-deep-review`: review PR diffs and changed-file callers.

Default safety posture:

```bash
codex exec --sandbox read-only --ask-for-approval never \
  "Use $fable-deep-review. Review this PR. Findings first."
```

Do not allow the action to push commits, approve PRs, merge, deploy, publish packages, mutate secrets, or spend funds.

