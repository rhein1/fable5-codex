## Direct answer

Payment attempts are stored in a process-local, module-scoped array. Every call creates and appends a new mutable object; nothing is persisted to disk or a database. Retries are documented as reusing an attempt with the same `idempotencyKey`, but the implementation never looks up that key, so it is not idempotent.

### Storage flow

1. Module loading initializes `attempts = []` ([paymentAttempts.js:1](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/src/paymentAttempts.js:1)).
2. `createPaymentAttempt` creates an ID from the current array length and copies `invoiceId`, `idempotencyKey`, and `amountCents` into a new object ([paymentAttempts.js:3](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/src/paymentAttempts.js:3)).
3. It assigns the documented `type: "FooPaymentAttempt"` discriminator ([paymentAttempts.js:9](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/src/paymentAttempts.js:9)).
4. It unconditionally appends and returns that object ([paymentAttempts.js:12](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/src/paymentAttempts.js:12)).
5. `allPaymentAttempts()` returns a shallow array copy ([paymentAttempts.js:16](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/src/paymentAttempts.js:16)). Changing that returned array does not change the store, but changing one of its record objects does.

## Documentation versus implementation

| Claim | Verdict |
|---|---|
| Attempts are idempotent and duplicate retries reuse the original ([README.md:7](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/README.md:7), [README.md:8](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/README.md:8)) | **Contradicted.** There is no lookup, comparison, or reuse branch. |
| A retry with the same `idempotencyKey` reuses the existing record ([api.md:5](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/docs/api.md:5)) | **Contradicted.** A duplicate-key probe produced `count: 2`, IDs `attempt_1` and `attempt_2`, and `sameObject: false`. |
| Records use `FooPaymentAttempt` ([api.md:3](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/docs/api.md:3)) | **Matches at the in-memory object level.** Both probed records had that type. |
| “Serialized” records use that type ([README.md:9](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/README.md:9)) | **Not demonstrated.** The fixture contains no serialization or persistence layer. |

The intended retry algorithm is inferable as “find an existing record by `idempotencyKey`; return it instead of appending.” The implementation always follows the ordinary creation path.

## What the tests actually cover

The test file exports a plain `testCreatesAttempt` function; it neither registers that function with `node:test` nor calls it at module scope ([paymentAttempts.test.js:1](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/tests/paymentAttempts.test.js:1), [paymentAttempts.test.js:3](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/tests/paymentAttempts.test.js:3)).

Observed behavior:

- Running `node --test` reports one passing file.
- Importing that test module and then reading the store reports `attempts_after_test_module_import=0`. Therefore the exported assertion did not run.
- If manually invoked in a fresh process, the function creates one record and checks only that the array length is one ([paymentAttempts.test.js:4](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/tests/paymentAttempts.test.js:4), [paymentAttempts.test.js:10](/C:/projects/fable5-codex/tmp/benchmarks/20260713T234332Z/examples/toy-buggy-repo/tests/paymentAttempts.test.js:10)).
- Calling it twice in one process fails with `expected one attempt`, because the singleton store has no reset mechanism.

Thus the default test run covers successful module loading, not payment behavior. Even the dormant function does not cover duplicate submissions, record reuse, returned values, IDs, copied fields, the type discriminator, serialization, persistence, validation, or mutation behavior.

## Rejected candidates

- **Type-name mismatch:** rejected; code and docs both use `FooPaymentAttempt`.
- **Direct backing-array exposure:** rejected; `slice()` protects the array container. Record objects remain shared and mutable.
- **The value `"retry_1"` constitutes retry coverage:** rejected; the test performs only one creation.
- **The green `node --test` result means the assertion ran:** rejected by the import-only probe showing zero attempts.

## Coverage and unknowns

All four files in the scoped fixture were inspected, and all scoped references and importers were traced. No other API entrypoint or caller exists within the fixture.

Unknowns left by the fixture include:

- whether idempotency keys should be global or scoped to an invoice;
- what should happen when the same key is reused with different amounts or invoice IDs;
- whether retries must remain idempotent across processes or restarts;
- what serialization format or durable store was intended;
- whether an out-of-scope benchmark harness manually invokes the exported test function.

Workflow: single-agent multi-lens, no ECF contract, no subagents per request, static inspection plus isolated Node probes. No files were edited; the scoped diff is empty.