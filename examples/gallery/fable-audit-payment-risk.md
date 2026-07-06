# Fable Audit Sample: Payment Attempt Risk

Use case:

```text
Use $fable-audit. Scope: examples/toy-buggy-repo. Focus: payment retry safety, duplicate attempt handling, status validation, test coverage, and source-backed proof. Include a Workflow Trace.
```

## Findings

1. **High: duplicate retries are not idempotent.**
   `examples/toy-buggy-repo/src/paymentAttempts.js` creates a new attempt for every call and stores it without checking whether the same payment was already submitted. A retry can create duplicate attempts instead of returning the existing one.

2. **Medium: payment status is copied without validation.**
   The implementation stores `input.status` directly. The sample docs imply known status values, but the source does not reject unknown values.

3. **Medium: tests only cover happy-path creation.**
   `examples/toy-buggy-repo/tests/paymentAttempts.test.js` checks one successful creation path. It does not exercise duplicate retries, invalid statuses, or mutation through returned objects.

## Rejected Candidates

- The presence of a `paymentKey` field is not evidence of idempotency because the source never checks it before storing.
- A passing creation test is not evidence that retry behavior or status validation works.

## Unknowns

- No external payment-state specification is included in the toy fixture.
- The expected retry identity field is not defined outside the example docs.

## Workflow Trace

- mode: single-agent multi-lens
- ECF contract: not emitted for this tiny example
- subagent trigger: not used
- no-subagent reason: small fixture and no explicit user subagent authorization
- lenses covered: correctness, data/idempotency, tests/docs
- local verification: source and test inspection
- coverage gaps: no runtime service or external payment spec
