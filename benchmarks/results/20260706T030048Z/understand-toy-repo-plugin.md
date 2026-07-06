**Direct Answer**

Payment attempts are stored in a module-level in-memory array, `attempts`, and every `createPaymentAttempt(input)` call constructs a new object, pushes it, and returns it. There is no lookup by `idempotencyKey`, so retries are not actually reused. See [src/paymentAttempts.js](C:/projects/fable5-codex/tmp/benchmarks/20260706T030048Z/examples/toy-buggy-repo/src/paymentAttempts.js:1).

The docs say payment attempts are idempotent and duplicate retry submissions reuse the original attempt: [README.md](C:/projects/fable5-codex/tmp/benchmarks/20260706T030048Z/examples/toy-buggy-repo/README.md:7), [docs/api.md](C:/projects/fable5-codex/tmp/benchmarks/20260706T030048Z/examples/toy-buggy-repo/docs/api.md:5). The implementation does not match that retry behavior. It does match the serialized `type: "FooPaymentAttempt"` claim: [src/paymentAttempts.js](C:/projects/fable5-codex/tmp/benchmarks/20260706T030048Z/examples/toy-buggy-repo/src/paymentAttempts.js:9), [README.md](C:/projects/fable5-codex/tmp/benchmarks/20260706T030048Z/examples/toy-buggy-repo/README.md:9).

**Flow**

1. `attempts` is initialized once at module scope: [src/paymentAttempts.js](C:/projects/fable5-codex/tmp/benchmarks/20260706T030048Z/examples/toy-buggy-repo/src/paymentAttempts.js:1).
2. `createPaymentAttempt` builds a fresh record with sequential `id`, copied `invoiceId`, copied `idempotencyKey`, copied `amountCents`, and `type: "FooPaymentAttempt"`: [src/paymentAttempts.js](C:/projects/fable5-codex/tmp/benchmarks/20260706T030048Z/examples/toy-buggy-repo/src/paymentAttempts.js:3).
3. It always appends with `attempts.push(attempt)` and returns the new object: [src/paymentAttempts.js](C:/projects/fable5-codex/tmp/benchmarks/20260706T030048Z/examples/toy-buggy-repo/src/paymentAttempts.js:12).
4. `allPaymentAttempts()` returns a shallow copy of the array with `attempts.slice()`: [src/paymentAttempts.js](C:/projects/fable5-codex/tmp/benchmarks/20260706T030048Z/examples/toy-buggy-repo/src/paymentAttempts.js:16).

I also ran a read-only duplicate retry probe with the same `idempotencyKey`; it produced `attempt_1` and `attempt_2`, `sameObject:false`, `count:2`.

**Tests And Coverage**

The only scoped test imports `createPaymentAttempt` and `allPaymentAttempts`: [paymentAttempts.test.js](C:/projects/fable5-codex/tmp/benchmarks/20260706T030048Z/examples/toy-buggy-repo/tests/paymentAttempts.test.js:1). Its exported helper creates one attempt and checks only that the total count is `1`: [paymentAttempts.test.js](C:/projects/fable5-codex/tmp/benchmarks/20260706T030048Z/examples/toy-buggy-repo/tests/paymentAttempts.test.js:3).

Coverage notes:

- Covered: single attempt insertion increments storage to one record.
- Not covered: duplicate `idempotencyKey` retry reuse.
- Not covered: returned object identity on retry.
- Not covered: conflicting retry payloads with same `idempotencyKey`.
- Not covered: `FooPaymentAttempt` type assertion, despite the docs claiming it.
- Automation caveat: `node --test examples/toy-buggy-repo/tests/paymentAttempts.test.js` reported one passing file, but the file does not declare a `test(...)`; it exports `testCreatesAttempt`. Manually importing and calling that function passes.

**Rejected Candidates**

- “Retries are idempotent”: rejected. No `find`, `filter`, map, or key lookup exists; the code always pushes.
- “Docs are entirely stale”: rejected. The `FooPaymentAttempt` serialization claim matches implementation.
- “Attempts are persisted externally”: rejected within scope. Storage is only the module-local `attempts` array.
- “Tests validate retry behavior”: rejected. The test performs one create and one length check only.

**Unknowns**

- Whether idempotency should be scoped only to `idempotencyKey` or also validate matching `invoiceId` and `amountCents`; docs only mention same `idempotencyKey`.
- Whether this toy repo is meant to use Node’s test runner directly or a custom harness that calls exported test functions.
- Whether module-level in-memory storage is intentional for the toy fixture or a stand-in for a real datastore.
