# Fable-5 Method

Fable-5 is an evidence-first workflow for codebase work. The method is useful when a task has enough risk that a single broad pass is likely to miss edge cases.

## Core Loop

```text
map target
run independent lens jobs
dedupe candidate findings
verify candidates
preserve refutations
run completeness critic
target gap pass
render report
```

## Evidence Standard

Every substantive claim should point to at least one of:

- source file and line
- command and relevant output
- runtime probe
- generated artifact
- documented unknown that blocks stronger verification

## Report Discipline

For audits and reviews, findings come first and are ordered by severity. Summaries are secondary. Unknowns and refuted candidates are preserved when they affect confidence.

