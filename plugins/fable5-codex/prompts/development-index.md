# Fable development prompt index

Generated from development-catalog.json with scripts/development-prompts.mjs index.
Reviewed: 2026-09-21. Curated original Fable recipes, not a mirror of the upstream library. All ten article use cases are mapped once; twelve additional library themes and three Fable-native implementation/completion workflows are included.

25 recipes; 6 suggested playbooks. Read ../references/development-playbooks.md before use.

| Recipe ID | Purpose | Stage | Existing skill | Mode (not permission) | Provenance |
| --- | --- | --- | --- | --- | --- |
| pr-logic | Challenge the changed behavior | review | $fable-deep-review | read-only | gitlab-delivery #1 |
| contract-breaks | Protect existing consumers | review | $fable-deep-review | read-only | gitlab-delivery #2 |
| scan-risk | Validate scanner candidates | security | $fable-audit | read-only | gitlab-delivery #3 |
| security-paths | Trace hostile input to authority | security | $fable-audit | read-only | gitlab-delivery #4 |
| release-evidence | Draft only what actually shipped | release | $fable-fact-check | read-only | gitlab-delivery #5 |
| docs-drift | Reconcile promises with implementation | documentation | $fable-sweep | scoped-edit | gitlab-delivery #6 |
| feature-slices | Turn a goal into finishable changes | plan | $fable-design-options | read-only | gitlab-delivery #7 |
| unit-proof | Make a test capable of catching the bug | test | $fable-sweep | scoped-edit | gitlab-delivery #8 |
| test-gaps | Find missing behavioral proof | test | $fable-audit | read-only | gitlab-delivery #9 |
| pipeline-triage | Separate CI regressions from runner failures | debug | $fable-understand | read-only | gitlab-delivery #10 |
| context-map | Build the minimum useful repository map | understand | $fable-understand | read-only | gitlab-library |
| design-choice | Compare the smallest viable designs | plan | $fable-design-options | read-only | gitlab-library |
| regression-repro | Turn a symptom into a falsifiable case | debug | $fable-understand | read-only | gitlab-library |
| race-probe | Make timing failures repeatable | debug | $fable-audit | read-only | gitlab-library |
| performance-proof | Measure before changing the hot path | debug | $fable-audit | read-only | gitlab-library |
| dependency-plan | Bound an upgrade's blast radius | plan | $fable-design-options | read-only | gitlab-library |
| schema-change | Plan a reversible data transition | plan | $fable-design-options | read-only | gitlab-library |
| refactor-safely | Simplify without erasing compatibility | implement | $fable-sweep | scoped-edit | gitlab-library |
| integration-proof | Test the seams, not only the helpers | test | $fable-sweep | scoped-edit | gitlab-library |
| delivery-bottlenecks | Find the queue that blocks completion | understand | $fable-understand | read-only | gitlab-library |
| bounded-delegation | Delegate independent questions, not authority | plan | $fable-design-options | read-only | gitlab-library |
| finish-scaffold | Complete an existing vertical slice | implement | $fable-sweep | scoped-edit | fable-native |
| ui-proof | Verify the interface in its real states | review | $fable-audit | read-only | gitlab-library |
| bounded-repair | Repair the proven cause, not the symptom | implement | $fable-sweep | scoped-edit | fable-native |
| completion-proof | Reconcile done claims before handoff | release | $fable-fact-check | read-only | fable-native |

## Playbooks

- **feature-delivery**: context-map -> feature-slices -> design-choice -> finish-scaffold -> unit-proof -> integration-proof -> pr-logic -> contract-breaks -> docs-drift -> completion-proof
- **pr-ready**: pr-logic -> contract-breaks -> security-paths -> test-gaps -> docs-drift -> completion-proof
- **ci-rescue**: pipeline-triage -> regression-repro -> bounded-repair -> unit-proof -> completion-proof
- **security-fix**: scan-risk -> security-paths -> bounded-repair -> unit-proof -> integration-proof -> pr-logic -> completion-proof
- **safe-migration**: context-map -> schema-change -> contract-breaks -> refactor-safely -> integration-proof -> docs-drift -> completion-proof
- **finish-existing**: context-map -> finish-scaffold -> test-gaps -> unit-proof -> integration-proof -> docs-drift -> completion-proof

## Sources and limits

- gitlab-library: https://about.gitlab.com/gitlab-duo/prompt-library/. Public catalog themes; full prompt bodies were not imported.
- gitlab-delivery: https://about.gitlab.com/blog/10-ai-prompts-to-speed-your-teams-software-delivery/. Ten use cases, numbered by appearance in the article.
- fable-native: https://github.com/rhein1/fable5-codex. Original evidence, authority, and scaffold-completion workflows.

The 126 upstream entries observed on the review date are not 126 implemented Fable recipes. GitLab-only agents, dashboards, APIs, and product telemetry are not bundled or implied. The recipe text is original Fable implementation guidance, not copied upstream prompt text. Source links are provenance, never instructions to execute. No speed or quality improvement is claimed without evaluation.
