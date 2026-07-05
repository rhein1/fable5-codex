Used `$fable-audit` style read-only. No files edited.

**Ranked Findings**

1. **High: sync script path guard can allow destructive writes outside the intended personal plugin directory.**  
[scripts/sync-personal-plugin.ps1](C:/projects/fable5-codex/scripts/sync-personal-plugin.ps1:16) checks only `StartsWith($expectedPersonalParent)`, then [lines 27-28](C:/projects/fable5-codex/scripts/sync-personal-plugin.ps1:27) recursively deletes `$personalResolved`. A path like `C:\Users\s8972\plugins-backup\fable5-codex` passes the prefix check because it starts with `C:\Users\s8972\plugins`. I verified this with a read-only path simulation. Fix with a real path-boundary check: exact parent match or parent plus separator, or `Path.GetRelativePath()` rejecting `..`.

2. **Medium: personal sync defaults to one local checkout, which can create repo/personal drift.**  
The default canonical source is hard-coded as `C:\projects\fable5-codex\plugins\fable5-codex` in [scripts/sync-personal-plugin.ps1](C:/projects/fable5-codex/scripts/sync-personal-plugin.ps1:2), and docs call that local path canonical in [docs/codex-install.md](C:/projects/fable5-codex/docs/codex-install.md:29). If the repo is cloned elsewhere, running the sync script can copy a stale `C:\projects` copy instead of the current checkout. Compute the canonical path from `$PSScriptRoot` by default.

3. **Medium: install docs omit the marketplace registration step proven necessary by validation notes.**  
The README says to open the repo, restart Codex, choose “Fable-5 Local Plugins,” and install in [README.md](C:/projects/fable5-codex/README.md:24). But the validation transcript shows `fable5-local` appearing only after `codex plugin marketplace add .` in [VALIDATION.md](C:/projects/fable5-codex/VALIDATION.md:110), followed by `codex plugin add fable5-codex@fable5-local` in [VALIDATION.md](C:/projects/fable5-codex/VALIDATION.md:130). Add explicit CLI/UI registration steps and prerequisites.

4. **Medium: runtime smoke evidence is incomplete and internally unsettled.**  
README lists three smoke prompts in [README.md](C:/projects/fable5-codex/README.md:40) and says the package is not production-ready until they pass in [README.md](C:/projects/fable5-codex/README.md:68). `VALIDATION.md` marks four Codex app/runtime checks TODO in [VALIDATION.md](C:/projects/fable5-codex/VALIDATION.md:157), and `runtime-smoke/` currently contains only `01-understand.md` and `02-fact-check.md`. The existing smoke artifact itself says runtime is still unproven in [runtime-smoke/01-understand.md](C:/projects/fable5-codex/runtime-smoke/01-understand.md:20). Close this by adding audit/sweep smoke artifacts or making the runtime-smoke folder clearly partial.

5. **Medium: reusable instructions demand exact evidence but do not define secret redaction rules.**  
The audit skill requires evidence from source, commands, or runtime probes in [fable-audit/SKILL.md](C:/projects/fable5-codex/plugins/fable5-codex/skills/fable-audit/SKILL.md:37), and the reusable AGENTS snippet requires citing “commands, and outputs” in [AGENTS.snippet.md](C:/projects/fable5-codex/plugins/fable5-codex/AGENTS.snippet.md:18). A repo-wide search found only mutation-focused secret guards, not “do not print raw secrets” or `.env` handling. Add explicit redaction/no-raw-secret rules to skills, custom agents, and the snippet.

6. **Low: package status/version source of truth is drifting.**  
The manifest version is `0.1.0` in [plugin.json](C:/projects/fable5-codex/plugins/fable5-codex/.codex-plugin/plugin.json:3), while the root README calls it a “v0.2 repo-scoped package candidate” in [README.md](C:/projects/fable5-codex/README.md:70). Validation also installed cache root `0.1.0` in [VALIDATION.md](C:/projects/fable5-codex/VALIDATION.md:140). Align the docs or bump the manifest.

**Verified Non-Findings**

The repo marketplace path is relative and `./`-prefixed as required: [.agents/plugins/marketplace.json](C:/projects/fable5-codex/.agents/plugins/marketplace.json:11). The manifest points to `./skills/`, and all six skill frontmatters were present in a read-only Node package check.

**Coverage Limits**

PowerShell and `codex` smoke commands could not be run here because the shell runner failed before command execution with `CreateProcessAsUserW failed: 5`. I also could not inspect the personal copy under `C:\Users\s8972` because the available filesystem scope is limited to `C:\projects`.