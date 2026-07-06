# Fable-5 Codex Workflow Snippet

Use this snippet in a repo `AGENTS.md` only when the repo wants Fable-5 behavior as standing policy. If this conflicts with the repo's existing instructions, constitution, safety policy, or owner-scoped rules, the repo instructions win.

## Fable-5 Workflows

Use Fable-5 when the task needs high-confidence analysis, broad coverage, or source-backed conclusions:

- Use `$fable-understand` for behavior questions and architecture mapping.
- Use `$fable-audit` for bug, risk, security, integration, and docs-vs-reality audits.
- Use `$fable-deep-review` for PR, branch, or diff review.
- Use `$fable-fact-check` for status docs, launch claims, changelogs, and "done/tested/working" assertions.
- Use `$fable-design-options` for technical options, migrations, and tradeoff analysis.
- Use `$fable-sweep` for repo-wide renames, migrations, and consistency passes.

Required reporting style:

- Cite exact files, lines, commands, and outputs for every substantive claim.
- Never print raw secrets, tokens, private keys, wallet keys, credential files, or `.env` values. Redact secret-like values and cite only the file/path/key name needed to explain the issue.
- Preserve unknowns and unverifiable areas explicitly.
- Separate target-system failures from runner/tool/environment failures.
- Do not claim subagent, test, browser, deploy, or runtime verification happened unless it did.
- When the user asks for ECF, subagents, repeatable evidence, CI ledgers, or durable receipts, declare an ECF-style run contract and include a Workflow Trace.
- Use real Codex subagents for large or high-risk Fable tasks when the runtime exposes a subagent tool and the user has not opted out. Treat repo-wide, cross-package, security/privacy/money/data/API, migration, release, exhaustive audit, deep review, and broad sweep tasks as large by default. Otherwise report `single-agent multi-lens` with the no-subagent reason.
- Keep the authority split clear: subagents may research, map, plan, draft, find, or verify; the main agent owns final findings and external side effects.
- For audits and reviews, list findings first by severity; keep summaries secondary.
- For write tasks, keep edits scoped and verify with the narrowest meaningful commands.
