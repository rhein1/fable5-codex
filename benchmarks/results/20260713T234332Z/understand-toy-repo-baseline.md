The repository documents idempotent retries, but the implementation is not idempotent and the test does not check retry behavior.

### Storage

[src/paymentAttempts.js](../../../examples/toy-buggy-repo/src/paymentAttempts.js#L1) keeps attempts in a module-level in-memory array:

- Every call creates a plain object with a sequential `attempt_N` ID and copies `invoiceId`, `idempotencyKey`, and `amountCents`.
- It sets `type: "FooPaymentAttempt"` ([line 9](../../../examples/toy-buggy-repo/src/paymentAttempts.js#L9)).
- It unconditionally pushes the object into the array ([line 12](../../../examples/toy-buggy-repo/src/paymentAttempts.js#L12)).
- There is no database, disk persistence, validation, or actual serialization.
- `allPaymentAttempts()` returns a shallow copy of the array. Callers cannot alter the stored collection by pushing to that copy, but the contained records remain shared and mutable.

### Intended versus actual retries

The README says duplicate retry submissions should reuse the original attempt ([README lines 7–9](../../../examples/toy-buggy-repo/README.md#L7)), and the API documentation identifies `idempotencyKey` as the matching key ([docs/api.md line 5](../../../examples/toy-buggy-repo/docs/api.md#L5)).

Thus, a retry is supposed to:

1. Find an existing attempt with the same `idempotencyKey`.
2. Return that attempt.
3. Avoid appending another record.

None of that lookup exists. A read-only execution probe with two identical submissions produced `attempt_1`, `attempt_2`, and a stored count of two. Behavior for a reused key with conflicting invoice or amount data is not specified anywhere.

### What the test covers

The only test creates one attempt and asserts that the total array length is exactly one ([paymentAttempts.test.js lines 3–12](../../../examples/toy-buggy-repo/tests/paymentAttempts.test.js#L3)).

It does not test:

- duplicate submissions or idempotency;
- reuse of the original object or ID;
- any stored field, including `type`;
- serialization;
- the returned value;
- isolation or state reset;
- mutation behavior of `allPaymentAttempts()`.

The test is merely an exported function—there is no package manifest, test runner, registration, or invocation in this fixture. If an external harness invokes it once with fresh module state, it passes. Calling it a second time in the same module fails with `expected one attempt`, because the shared array already contains the first record. No files were changed.