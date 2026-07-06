# Fable Fact-Check Sample: Status Claims

Use case:

```text
Use $fable-fact-check. Doc: evals/fact-check-fixture/STATUS.md. Check every claim against source and tests. Include supported claims, unsupported claims, rejected candidates, coverage notes, and unknowns.
```

## Supported Claims

- `createPaymentAttempt` is exported by the fixture source.
- The test imports and calls `createPaymentAttempt`.

## Unsupported Claims

- "The payment attempt library is complete" is unsupported because no completion criteria are defined.
- "It supports idempotent retries" is false for the fixture because repeated calls create repeated stored attempts.
- "It validates all payment statuses" is false because status is assigned directly.
- "It has a duplicate retry test" is false because the test covers one creation path.

## Rejected Candidates

- Importability proves the function exists, not that retries are safe.
- A field named `status` proves storage, not validation.
- A test file proves some test coverage, not coverage of duplicate behavior.

## Unknowns

- The fixture does not define the valid status set.
- The fixture does not define whether idempotency should key on payment ID, payment key, user ID, or another input.

## Workflow Trace

- mode: single-agent multi-lens
- ECF contract: not emitted for this tiny example
- subagent trigger: not used
- no-subagent reason: bounded three-file fixture
- lenses covered: document claims, source implementation, tests
- local verification: source/test read plus claim-by-claim comparison
- coverage gaps: no external product spec
