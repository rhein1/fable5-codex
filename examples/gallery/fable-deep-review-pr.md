# Fable Deep Review Sample: Pull Request

Use case:

```text
Use $fable-deep-review. Review this branch against main for correctness, security, packaging, tests, and docs-vs-reality. Include findings first and a Workflow Trace.
```

## Verdict

Needs Updates when a blocking issue is found; LGTM only when the reviewed diff is consistent with tests, docs, packaging, and runtime claims.

## Example Finding

**High: README install command points to an unpublished package.**

Evidence:

- `README.md` shows `npx fable5-codex`.
- `package.json` defines package metadata.
- `npm view fable5-codex version` fails or returns a different version.

Failure scenario:

A user follows the first install path and receives an npm resolution error or installs an outdated package.

Safest fix:

Publish the npm package, or mark npm install as pending and keep `npx github:rhein1/fable5-codex` as the primary command until publish succeeds.

## Workflow Trace

- mode: single-agent multi-lens
- ECF contract: not emitted
- subagent trigger: not used in this sample
- no-subagent reason: sample output only
- lenses covered: install path, package metadata, docs-vs-reality, release safety
- local verification: source and registry checks
- coverage gaps: no live PR context in sample
