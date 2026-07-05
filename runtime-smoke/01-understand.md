**Direct Answer**
This repo is a repo-scoped package for developing and validating the Fable-5 Codex plugin. Its own README says it contains the installable plugin, repo-local marketplace catalog, examples, eval fixtures, docs, package validation, and personal-plugin sync script: [README.md](C:/projects/fable5-codex/README.md:5).

The plugin is `fable5-codex` version `0.1.0`, described as “Fable-5 evidence-first review, audit, fact-check, understanding, design, and sweep workflows for Codex”: [plugin.json](C:/projects/fable5-codex/plugins/fable5-codex/.codex-plugin/plugin.json:2). The repo marketplace exposes it through `fable5-local` with local source path `./plugins/fable5-codex`: [marketplace.json](C:/projects/fable5-codex/.agents/plugins/marketplace.json:2), [marketplace.json](C:/projects/fable5-codex/.agents/plugins/marketplace.json:8), [marketplace.json](C:/projects/fable5-codex/.agents/plugins/marketplace.json:11).

The manifest points Codex at `./skills/`, displays the plugin as “Fable-5 for Codex,” and advertises `Interactive` and `Write` capabilities: [plugin.json](C:/projects/fable5-codex/plugins/fable5-codex/.codex-plugin/plugin.json:9), [plugin.json](C:/projects/fable5-codex/plugins/fable5-codex/.codex-plugin/plugin.json:11), [plugin.json](C:/projects/fable5-codex/plugins/fable5-codex/.codex-plugin/plugin.json:17).

**Six Skills**
| Skill | Purpose | Citation |
|---|---|---|
| `$fable-audit` | Evidence-first audit for correctness, security, privacy, data, integration, ops, tests, and docs-vs-reality risks. | [SKILL.md](C:/projects/fable5-codex/plugins/fable5-codex/skills/fable-audit/SKILL.md:2) |
| `$fable-deep-review` | Deep review for PRs, branches, diffs, or proposed patches. | [SKILL.md](C:/projects/fable5-codex/plugins/fable5-codex/skills/fable-deep-review/SKILL.md:2) |
| `$fable-fact-check` | Claim-by-claim verification of docs/status claims against evidence. | [SKILL.md](C:/projects/fable5-codex/plugins/fable5-codex/skills/fable-fact-check/SKILL.md:2) |
| `$fable-understand` | Source-grounded codebase explanation and behavior tracing. | [SKILL.md](C:/projects/fable5-codex/plugins/fable5-codex/skills/fable-understand/SKILL.md:2) |
| `$fable-design-options` | Evidence-grounded design options and tradeoff memos. | [SKILL.md](C:/projects/fable5-codex/plugins/fable5-codex/skills/fable-design-options/SKILL.md:2) |
| `$fable-sweep` | Repo-wide implementation workflow for broad changes and migrations. | [SKILL.md](C:/projects/fable5-codex/plugins/fable5-codex/skills/fable-sweep/SKILL.md:2) |

The package validator also hard-codes these exact six required skill names and checks each `SKILL.md` for matching front matter: [validate-package.ps1](C:/projects/fable5-codex/scripts/validate-package.ps1:8), [validate-package.ps1](C:/projects/fable5-codex/scripts/validate-package.ps1:56).

**UNKNOWNS**
- Codex app runtime is still unproven: `VALIDATION.md` marks “Codex app shows plugin” and four skill/runtime smoke checks as TODO: [VALIDATION.md](C:/projects/fable5-codex/VALIDATION.md:157).
- Publishing readiness is not proven. The README explicitly says this should not be called production-ready until the Codex-in-app smoke tests pass in a fresh thread: [README.md](C:/projects/fable5-codex/README.md:68).
- The required fresh-thread smoke prompts are still listed as required before publishing: [VALIDATION.md](C:/projects/fable5-codex/VALIDATION.md:195).
- I did not edit files. I also did not freshly run the PowerShell validator in this turn; I performed read-only file inspection plus a read-only Node check of manifest, marketplace, skill directories, and skill front matter.