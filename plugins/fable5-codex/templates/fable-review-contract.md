# Fable Review Contract

Use this contract for PR review bots, review-loop skills, or durable review artifacts that need a machine-readable verdict.

## Verdict

The first non-empty line must be exactly one of:

- `LGTM`
- `Needs Updates`

Use `Needs Updates` when at least one blocking finding is present. Use `LGTM` only when no blocking findings remain. Non-blocking findings may follow `LGTM`.

## Sections

Use these H3 sections and omit empty sections:

```text
### Needs Fixing
### Requires Human Review
### Recommended Optional
### Create Follow-up Issue
```

Blocking sections:

- `### Needs Fixing`
- `### Requires Human Review`

Non-blocking sections:

- `### Recommended Optional`
- `### Create Follow-up Issue`

## Finding Shape

Each finding should be a numbered list item with:

```text
1. **One-sentence title**
   File/line evidence and why it matters.
   Failure scenario: realistic user, data, money, security, or operations consequence.
   Invariant: property the fix must preserve.
   Must survive: 1-3 adversarial cases a fix must handle.
```

## Review Discipline

- Inspect every changed file before `LGTM`.
- Check CI or state that CI could not be checked under `Requires Human Review`.
- Drop style-only trivia and speculative edge cases without realistic trigger.
- Never drop unconfirmed findings involving money, data integrity, security, privacy, authz, secret handling, migrations, or automated trust/protection logic. Put them under `Requires Human Review` when evidence is insufficient.
- Write findings as instructions another agent can act on.
- Include a `Workflow Trace` after the sections when Fable-5/ECF was used.
