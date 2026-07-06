# OSS Roadmap

Recommended package split:

```text
fable5/
  packages/
    fable5-prompts/
    fable5-codex-plugin/
    fable5-runner/
    fable5-github-action/
    fable5-dashboard/
```

First release:

- Codex plugin with six skills
- Schema for run, ECF contract, workflow trace, finding, judge, coverage, and unknown records
- `codex exec` wrapper scripts
- Optional custom-agent profiles
- Micro ECF-style run-contract reference and starter template
- Minimal examples

Later releases:

- TypeScript runner with adapter interface
- GitHub Action for read-only audit and fact-check gates
- Evidence dashboard for contracts, Workflow Traces, candidates, judge votes, refutations, coverage, and unresolved unknowns
