# Implementation Guide

This plugin translates a Claude-style multi-agent workflow kit into Codex-native primitives:

- Standing policy belongs in repo `AGENTS.md` when a repo owner wants it.
- Reusable workflows belong in Codex skills under this plugin.
- Optional agent profiles live in `custom-agents/` and can be copied into a repo `.codex/agents/` directory. They are templates, not manifest-wired Codex subagents.
- Scripted local or CI runs can call `codex exec` through `scripts/fable5-codex.ps1` or `scripts/fable5-codex.sh`.
- Structured evidence can be stored with `schemas/fable5.schema.json`.
- ECF-style governance lives in `references/ecf-run-contract.md` and `templates/fable-ecf-run-contract.json`. This is a public Micro ECF-style contract, not private Full ECF runtime code.
- Bot-compatible PR review verdicts live in `templates/fable-review-contract.md`.
- The root `bin/install.mjs` provides a GitHub/npx copy-based install path for Codex personal and project-local marketplaces.

Subagent behavior:

- Codex should use real subagents for large or high-risk Fable tasks when the runtime exposes a subagent tool and the user has not opted out. Explicit user subagent requests still trigger the same path for smaller scopes.
- `$fable-audit` must still show the workflow every time through a `Workflow Trace` section and should declare the ECF run contract when the user asks for ECF, subagents, repeatable evidence, CI ledgers, or durable receipts.
- When subagents are not available, the task is small/routine, or the user opted out, the audit should run as `single-agent multi-lens` and say that directly instead of implying independent review happened.
- Do not claim `multi-agent` unless real subagent IDs or runtime-visible handles exist.
- Keep authority split explicit: subagents research/plan/find/verify; the main agent spot-checks and owns final findings plus side effects.

Suggested rollout:

1. Install the plugin from the personal marketplace.
2. Start a new Codex thread so the skills are loaded.
3. Try `$fable-understand` on a small subsystem.
4. Try `$fable-audit` in read-only mode before allowing any edits.
5. Try the explicit multi-subagent prompt from `prompts/prompt-calls.md` in a runtime that exposes subagents.
6. If your Codex surface supports repo-local custom agents, copy the desired `custom-agents/*.toml` profiles into that repo's `.codex/agents/` directory before expecting those names to be selectable.
7. Copy `AGENTS.snippet.md` into a repo only after confirming it does not conflict with that repo's policy.

Do not use the workflow as a substitute for actual verification. Fable-5 is a discipline for finding and proving work, not a claim that coverage is complete.
