# Model profiles (compatibility guide)

Current defaults are defined in [the shared model policy](../plugins/fable5-codex/references/model-support.md) and versioned profile config. Balanced/deep prefer GPT-6.1 Sol medium/max where the actual selected client advertises it; economical work prefers GPT-6 Luna. Older supported alternatives are explicit fallbacks, not assumed modern defaults. This filename is retained for existing links.

The packaged Luna worker-default keys require Codex CLI `0.152.0` or newer. The wrappers inspect the selected executable and stop with an upgrade message before launching an older CLI.

## Exact Configuration

Ultra is a reasoning and multi-agent setting. It is not a separate model slug.

```toml
model = "gpt-6.1-sol"
model_reasoning_effort = "max"

[agents]
default_subagent_model = "gpt-6-luna"
default_subagent_reasoning_effort = "medium"
max_concurrent_threads_per_session = 3
max_depth = 1
```

Check the client's catalog before applying the compatibility-named deep template. Wrappers resolve profiles without changing global configuration. Explicit user overrides are preserved or fail clearly.

Interactive use retains the model selected in that session. Codex UI Ultra may enable orchestration; it is not a portable API reasoning effort. GPT-6.1 Sol's API supports low through max as documented in the shared policy. Model access depends on sign-in mode, client and account.

## What Ultra Adds

Codex Ultra can delegate suitable work. Fable's template caps concurrent threads at `3` and depth at `1`; these limits are not evidence that any worker ran. Quick verification avoids unnecessary delegation. Fable adds:

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

Resolve preferences against the exact client's model/effort catalog. A dry run never establishes access; a completed observed turn is needed. Record all requested/actual profiles and fallbacks. See the shared policy for the independently observed npm/native-client catalog difference.

## Official Sources

- [Current Codex models and surface limits](https://learn.chatgpt.com/docs/models)
- [GPT-6.1 Sol API specification](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [Codex configuration](https://developers.openai.com/codex/config-basic)
