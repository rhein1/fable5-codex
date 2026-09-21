# GPT-5.6 Sol Ultra

Fable-5 v0.4 uses `gpt-5.6-sol` with `ultra` reasoning as the coordinator for large or high-risk work and `gpt-5.6-luna` with `medium` reasoning for bounded subagents by default.

GPT-5.6 requires Codex CLI `0.144.0` or newer. The packaged wrappers inspect the selected executable and stop with an upgrade message before launching an older CLI.

## Exact Configuration

Ultra is a reasoning and multi-agent setting. It is not a separate model slug.

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "ultra"

[agents]
default_subagent_model = "gpt-5.6-luna"
default_subagent_reasoning_effort = "medium"
max_concurrent_threads_per_session = 3
max_depth = 1
```

Copy the packaged template from `plugins/fable5-codex/templates/sol-ultra.config.toml` into `~/.codex/config.toml` for a personal default or `.codex/config.toml` in a trusted repository for a project default.

In the Codex app, select **GPT-5.6 Sol** and **Ultra** beneath the composer. If Ultra is hidden, enable **Ultra in model picker slider** under **Settings > Configuration**.

## What Ultra Adds

OpenAI describes Ultra as its highest-capability setting. Codex can proactively delegate suitable work to subagents. Fable-5 caps concurrent threads at `3`, keeps `agents.max_depth` at `1`, and defaults workers to Luna medium. Those values are limits and defaults, not a promise that three workers will run. Additional lenses queue behind that cap. Fable-5 adds the workflow discipline around that runtime:

- disjoint evidence lenses
- ECF scope and authority contracts
- read-only subagents by default
- main-agent verification of load-bearing claims
- real subagent IDs in the Workflow Trace
- explicit unknowns and coverage gaps

Ultra does not guarantee that every task should fan out. Small, tightly coupled, or immediately blocking work may stay local. Fable skills explicitly request delegation for large or high-risk tasks so behavior does not depend only on proactive model judgment. The four-lens audit prompt is a Fable workflow example, not Codex's default worker count.

## Wrapper Commands

PowerShell:

```powershell
.\plugins\fable5-codex\scripts\fable5-codex.ps1 -Mode audit -Scope . -Subagents
```

Pass `-CodexExecutable <path>` to use an isolated or non-default CLI.

Use `-SubagentModel` and `-SubagentReasoningEffort` to override only the workers while keeping the coordinator unchanged.

Bash:

```bash
bash ./plugins/fable5-codex/scripts/fable5-codex.sh audit . "correctness, security, data, operations, tests, and docs-vs-reality" --subagents
```

Pass `--codex-executable=<path>` or set `FABLE5_CODEX_EXECUTABLE` to use a non-default CLI.

Use `--subagent-model=`, `--subagent-reasoning=`, or the matching `FABLE5_SUBAGENT_*` environment variables for worker-only overrides.

Inspect the generated configuration without starting Codex:

```powershell
.\plugins\fable5-codex\scripts\fable5-codex.ps1 -DryRun
```

## Fallbacks

Use `max` when you need deep single-task coordinator reasoning without Ultra's proactive multi-agent coordination. Use `xhigh` for demanding work where lower latency and usage matter. Keep Luna medium as the bounded worker default. If a runtime cannot honor the requested worker profile, record the actual model and effort plus the fallback reason in the Workflow Trace.

## Official Sources

- [GPT-5.6 announcement and Ultra behavior](https://openai.com/index/gpt-5-6/)
- [Codex model selection](https://developers.openai.com/codex/models)
- [Codex configuration](https://developers.openai.com/codex/config-basic)
