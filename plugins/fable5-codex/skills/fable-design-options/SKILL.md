---
name: fable-design-options
description: Evidence-grounded design option generation for technical architecture, migrations, APIs, data models, safety controls, operational changes, and implementation plans. Use when the user asks for options, tradeoffs, design review, migration strategy, or a decision memo grounded in the current codebase.
---

# Fable Design Options

Generate options after reading the actual system. Avoid abstract architecture advice when source evidence is available.

## Workflow

1. Clarify the decision, constraints, authority boundaries, and success criteria from the prompt and repo instructions.
2. Read the relevant implementation, callers/importers, tests, docs, and operational surfaces.
3. Identify hard constraints: public contracts, migration compatibility, security/privacy rules, performance needs, deploy boundaries, and rollback requirements.
4. Produce 2-4 viable options. Include a conservative option and a higher-leverage option when both are realistic.
5. For each option, state:
   - implementation shape
   - benefits
   - risks
   - migration/rollback path
   - tests or probes needed
   - evidence that makes it fit or not fit the repo
6. Recommend one option only after comparing it against the constraints.

## Output

Use a short decision memo. Separate facts from judgment. Call out unknowns that would change the recommendation.

