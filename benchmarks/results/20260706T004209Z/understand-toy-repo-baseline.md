No files edited.

`examples/toy-buggy-repo` stores payment attempts in a module-level in-memory array: [paymentAttempts.js](/c:/projects/fable5-codex/tmp/benchmarks/20260706T004209Z/examples/toy-buggy-repo/src/paymentAttempts.js:1) declares `const attempts = []`. Every call to `createPaymentAttempt` builds a new plain object with:

- `id: attempt_${attempts.length + 1}` at [line 5](/c:/projects/fable5-codex/tmp/benchmarks/20260706T004209Z/examples/toy-buggy-repo/src/paymentAttempts.js:5)
- copied `invoiceId`, `idempotencyKey`, and `amountCents` at [lines 6-8](/c:/projects/fable5-codex/tmp/benchmarks/20260706T004209Z/examples/toy-buggy-repo/src/paymentAttempts.js:6)
- `type: "FooPaymentAttempt"` at [line 9](/c:/projects/fable5-codex/tmp/benchmarks/20260706T004209Z/examples/toy-buggy-repo/src/paymentAttempts.js:9)

It then appends that object with `attempts.push(attempt)` and returns it at [lines 12-13](/c:/projects/fable5-codex/tmp/benchmarks/20260706T004209Z/examples/toy-buggy-repo/src/paymentAttempts.js:12). `allPaymentAttempts()` returns `attempts.slice()` at [line 17](/c:/projects/fable5-codex/tmp/benchmarks/20260706T004209Z/examples/toy-buggy-repo/src/paymentAttempts.js:17), so callers get a new array but the same underlying attempt objects.

Retries are supposed to be idempotent according to the docs. The README claims “Payment attempts are idempotent” and “Duplicate retry submissions reuse the original attempt” at [README.md](/c:/projects/fable5-codex/tmp/benchmarks/20260706T004209Z/examples/toy-buggy-repo/README.md:7). The API doc is more specific: retries should reuse the existing `FooPaymentAttempt` for the same `idempotencyKey` at [docs/api.md](/c:/projects/fable5-codex/tmp/benchmarks/20260706T004209Z/examples/toy-buggy-repo/docs/api.md:5).

The implementation does not do that. There is no lookup by `idempotencyKey`, no duplicate check, and no branch that returns an existing attempt. A second call with the same `idempotencyKey` will create `attempt_2` and append it.

The tests only cover the single-create happy path. [paymentAttempts.test.js](/c:/projects/fable5-codex/tmp/benchmarks/20260706T004209Z/examples/toy-buggy-repo/tests/paymentAttempts.test.js:3) exports `testCreatesAttempt`, calls `createPaymentAttempt` once with `idempotencyKey: "retry_1"` at [lines 4-8](/c:/projects/fable5-codex/tmp/benchmarks/20260706T004209Z/examples/toy-buggy-repo/tests/paymentAttempts.test.js:4), then asserts only that `allPaymentAttempts().length !== 1` should fail at [lines 10-12](/c:/projects/fable5-codex/tmp/benchmarks/20260706T004209Z/examples/toy-buggy-repo/tests/paymentAttempts.test.js:10).

They do not cover duplicate retries, reuse of the original attempt, returned object identity, generated IDs, stored field values, `FooPaymentAttempt` serialization/type, or test isolation/reset behavior.