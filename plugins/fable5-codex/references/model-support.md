# Models, clients and explicit profiles

`config/model-profiles.json` is the source of profile preferences. It does not
claim availability. `scripts/model-support.mjs` initializes the selected Codex
app-server and reads `model/list` without starting a thread or inference turn.
The wrappers use the same resolver. Node 18+, Git and a supported Codex client
are required; the worker-default keys require Codex CLI 0.152.0 or newer.

| Profile | Preferred coordinator | Preferred bounded worker |
| --- | --- | --- |
| balanced | GPT-6.1 Sol, medium | GPT-6 Luna, medium |
| deep | GPT-6.1 Sol, max | GPT-6 Luna, medium |
| economical | GPT-6 Luna, medium | GPT-6 Luna, medium |

The config lists older catalog-compatible alternatives. A profile selects only
an advertised model/effort pair and reports any fallback. Explicit coordinator
or worker overrides either stay as requested or fail clearly; they are never
silently replaced. Custom profile preferences can be edited in the versioned
config. Keep model selection separate from authority, tools and permission scope.

```sh
node scripts/model-support.mjs --profile balanced --codex-executable /path/to/codex
node scripts/model-support.mjs --profile deep --dry-run
```

Catalog presence is a preflight, not entitlement. `accessVerified` remains false
until an actual completed turn is independently observed. `--dry-run` reports
preferences with `catalogChecked: false` and never starts Codex. A supplied
`--catalog FILE` is intended for deterministic tests; it is explicitly unverified,
not live discovery. No API key or separate paid API is required by the resolver.

## Select the actual client

Use `Get-Command codex -All` on Windows or `command -v codex` on POSIX, then
inspect the exact executable's version and login status. An npm shim and the
desktop-bundled native executable can be different clients with different model
catalogs. Both wrappers default to `codex` and resolve it once in PATH-directory
order, preserving an explicit `-CodexExecutable` or `--codex-executable=` override.
On Windows each directory is searched for `.ps1`, `.cmd`, `.exe`, `.com`, then the
extensionless name; a later desktop executable never replaces an earlier npm shim.
The same absolute launcher descriptor supplies version, catalog and execution.
Recognized standard `@openai/codex` npm `.cmd` shims dispatch their own adjacent
package's declared JavaScript entrypoint through Node with literal arguments.
PowerShell scripts use `pwsh -NoProfile -File` without bypassing custom environment
or argument behavior; customized/unknown batch files fail with an actionable error
rather than using `cmd /c`. No command string or execution-policy override is assembled.
Dry runs do not resolve or invoke Codex. Reports must identify the client and actual
requested/resolved models.

Observed during local preparation on 2026-10-20: the npm CLI 0.152.0 catalog
contained GPT-5.6 Sol/Terra/Luna; the desktop native 0.163.0-alpha.10.2 catalog
included GPT-6.1 Sol and GPT-6 Luna. These are different surfaces, not proof of
all account entitlements or an API availability claim. Recheck on each host.

## Reasoning and Ultra

Validate reasoning against the chosen client's advertised capabilities. In the
desktop/CLI, Ultra includes orchestration and may allow automatic delegation.
It is not a portable OpenAI API `reasoning.effort` value. GPT-6.1 Sol's API uses
low, medium, high, xhigh or max; API availability does not prove ChatGPT/Codex
access. The preferred deep profile uses max. A legacy Codex catalog may advertise
ultra for GPT-5.6 Sol; only that surface-specific fallback may use it. Never
translate a UI preset directly into an API request.

Interactive sessions keep the model already selected. Skills cannot change an
active parent behind the user's back. Record requested and actual coordinator
and worker model/effort, real subagent IDs and fallbacks. Do not claim a model or
worker ran merely because a configuration file requested it. Small quick checks
do not need subagents; keep substantive synthesis and final verification with
the coordinator. Retain user opt-outs and overrides.

Official sources checked 2026-10-20:

- [Codex models and sign-in/surface availability](https://learn.chatgpt.com/docs/models)
- [GPT-6.1 Sol API specifications](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [App-server model catalog and entitlement distinction](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)

Historical benchmark results remain exactly as recorded. New profile preferences
do not retroactively update old model IDs, reasoning levels, costs or results.
