# Demo Audit Expected Shape

Target:

```text
evals/audit-fixture
```

Expected findings from a strong `$fable-audit` run:

1. High: duplicate payment attempts are not idempotent because `createPaymentAttempt` appends a new attempt for every retry.
2. Medium: status strings are unbounded because arbitrary `status` input is stored without validation.
3. Low: README says retries are safe, but the implementation does not enforce idempotency.

Expected unknowns:

- No real payment processor is present in the fixture.
- No persistent database behavior is modeled.
- No concurrency test exists.

The exact report wording does not need to match this file. The findings, evidence, and unknowns should.

