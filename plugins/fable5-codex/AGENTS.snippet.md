# Fable-5 Codex Workflow Snippet

Use this snippet in a repo `AGENTS.md` only when the repo wants Fable-5 behavior as standing policy. If this conflicts with the repo's existing instructions, constitution, safety policy, or owner-scoped rules, the repo instructions win.

## Fable-5 Workflows

Use Fable-5 when the task needs high-confidence analysis, broad coverage, or source-backed conclusions:

- Use `$fable-understand` for behavior questions and architecture mapping.
- Use `$fable-verify` to check completion against acceptance criteria before merge or handoff.
- Use `$fable-audit` for bug, risk, security, integration, and docs-vs-reality audits.
- Use `$fable-deep-review` for PR, branch, or diff review.
- Use `$fable-fact-check` for status docs, launch claims, changelogs, and "done/tested/working" assertions.
- Use `$fable-design-options` for technical options, migrations, and tradeoff analysis.
- Use `$fable-sweep` for repo-wide renames, migrations, consistency passes and complex connected-workflow repairs.

### Automatic routing for complex Agoragentic repairs

Do not wait for the user to name Fable. For an authorized Agoragentic repair
(including Agent Marketplace, Triptych OS / Agent OS, Interchange and Fable) with
repeated integration failures, process/reviewer boundaries, generated/hash-bound
packages, or timed live/attended handoffs, select `fable-sweep` and read its linked
`references/complex-workflow-qualification.md`. Measure the selected route, repair
its owning producers, test behavior and relevant critical-guard mutations, obtain
independent review when authorized and available, and qualify the final assembled
route locally before MFA or another paid
attempt. Diagnostics with substituted bytes or scripted reviewers do not qualify.
If required independent review cannot run, report the gap without claiming full
qualification. This composition does not require every Fable skill on every task.

Use `fable-deep-review` for review-only requests and `fable-verify` for readiness or
completion questions; neither silently authorizes repairs. Apply relevant stages
and reuse matching evidence; do not impose the full procedure on routine typos or
isolated low-risk edits. Preserve current scope, explicit opt-outs, paused work and
the designated repair owner. Automatic routing grants no background execution,
provider access, retries, publication, installation, spending or authority to
resume Interchange or solicit MFA/restart approval while paused. If the installed
skill is unavailable, report that limitation
instead of claiming Fable ran.

### Reporting

Required reporting style:

- Cite exact files, lines, commands, and outputs for every substantive claim.
- Never print raw secrets, tokens, private keys, wallet keys, credential files, or `.env` values. Redact secret-like values and cite only the file/path/key name needed to explain the issue.
- Preserve unknowns and unverifiable areas explicitly.
- Separate target-system failures from runner/tool/environment failures.
- Do not claim subagent, test, browser, deploy, or runtime verification happened unless it did.
- When the user asks for ECF, subagents, repeatable evidence, CI ledgers, or durable receipts, declare an ECF-style run contract and include a Workflow Trace.
- Use real Codex subagents for large or high-risk Fable tasks when the runtime exposes a subagent tool and the user has not opted out. Treat repo-wide, cross-package, security/privacy/money/data/API, migration, release, exhaustive audit, deep review, and broad sweep tasks as large by default. Otherwise report `single-agent multi-lens` with the no-subagent reason.
- Keep the parent on its configured model. Use the centralized `references/model-support.md` policy and supported profile settings for workers, preserving explicit overrides. Record requested and actual models/efforts and fallbacks.
- Keep the authority split clear: subagents may research, map, plan, draft, find, or verify; the main agent owns final findings and external side effects.
- For audits and reviews, list findings first by severity; keep summaries secondary.
- For write tasks, keep edits scoped and verify with the narrowest meaningful commands.
