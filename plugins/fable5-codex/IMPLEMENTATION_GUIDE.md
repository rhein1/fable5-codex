# Implementation Guide

This plugin translates a Claude-style multi-agent workflow kit into Codex-native primitives:

- Standing policy belongs in repo `AGENTS.md` when a repo owner wants it.
- Reusable workflows belong in Codex skills under this plugin.
- Optional agent profiles live in `custom-agents/` and can be copied into a repo `.codex/agents/` directory. They are templates, not manifest-wired Codex subagents.
- Scripted local or CI runs can call `codex exec` through `scripts/fable5-codex.ps1` or `scripts/fable5-codex.sh`.
- Structured evidence can be stored with `schemas/fable5.schema.json`.

Subagent behavior:

- Codex only spawns subagents when the user explicitly asks for subagents, delegation, or parallel agent work and the runtime exposes a subagent tool.
- `$fable-audit` must still show the workflow every time through a `Workflow Trace` section.
- When subagents are not available or not explicitly requested, the audit should run as `single-agent multi-lens` and say that directly instead of implying independent review happened.

Suggested rollout:

1. Install the plugin from the personal marketplace.
2. Start a new Codex thread so the skills are loaded.
3. Try `$fable-understand` on a small subsystem.
4. Try `$fable-audit` in read-only mode before allowing any edits.
5. If your Codex surface supports repo-local custom agents, copy the desired `custom-agents/*.toml` profiles into that repo's `.codex/agents/` directory before expecting those names to be selectable.
6. Copy `AGENTS.snippet.md` into a repo only after confirming it does not conflict with that repo's policy.

Do not use the workflow as a substitute for actual verification. Fable-5 is a discipline for finding and proving work, not a claim that coverage is complete.
