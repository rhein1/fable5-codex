## Findings

### 1. High — Payment retries create duplicate attempts

[createPaymentAttempt()](../../../evals/audit-fixture/src/paymentAttempts.js#L3) copies `paymentKey` without checking it, generates a new ID from array length at [line 5](../../../evals/audit-fixture/src/paymentAttempts.js#L5), and unconditionally appends at [line 12](../../../evals/audit-fixture/src/paymentAttempts.js#L12).

An isolated probe submitting the same invoice, key, amount, and status twice returned:

```json
{"ids":["attempt_1","attempt_2"],"count":2,"reusedOriginal":false}
```

Reusing one key with amounts `1000` and `2500` also persisted both records. A client retry after a timeout therefore creates another processable attempt instead of replaying the original result. This contradicts the retry and duplicate claims in [README.md:7](../../../evals/audit-fixture/README.md#L7).

Safest fix: enforce atomic uniqueness on a durable idempotency-key scope, return the original result for an equivalent replay, and reject key reuse with conflicting immutable payment fields.

### 2. Medium — Status values are not validated

[Payment attempt creation](../../../evals/audit-fixture/src/paymentAttempts.js#L9) stores `input.status` verbatim. There is no allowlist, required-field check, or rejection path.

Runtime probes successfully persisted:

```text
"not-a-real-status"
null
undefined
```

That directly contradicts [README.md:9](../../../evals/audit-fixture/README.md#L9). Invalid or missing statuses can consequently reach any downstream consumer.

Safest fix: define the allowed states and transition ownership, validate before insertion, and preferably initialize the creation status internally rather than accepting arbitrary caller state.

### 3. Medium — Callers can mutate stored attempts through returned references

The object inserted into the module-global array is returned directly at [paymentAttempts.js:12](../../../evals/audit-fixture/src/paymentAttempts.js#L12). [listPaymentAttempts()](../../../evals/audit-fixture/src/paymentAttempts.js#L16) copies the array but not its contained objects.

A probe mutated the creation result and a listed record; a subsequent read returned:

```json
{
  "paymentKey": "tampered-via-list-result",
  "status": "tampered-via-create-result"
}
```

A caller can therefore rewrite status, payment key, amount, or ID without a validated update operation. This defeats record integrity and would undermine future duplicate detection.

Safest fix: keep internal records private and return immutable copies. Route legitimate state changes through validated transition methods.

### 4. Medium — The nominal test produces a load-only green result

[paymentAttempts.test.js:3](../../../evals/audit-fixture/tests/paymentAttempts.test.js#L3) exports `testPaymentAttemptCreated`, but neither invokes it nor registers it with `node:test`.

Observed behavior:

- Direct execution exited `0` without exercising the assertion.
- `node --test evals/audit-fixture/tests/paymentAttempts.test.js` reported one passing file-level test because the module loaded.
- Importing the test left the stored count at `0`, proving the exported test function was not called.
- When manually invoked, it checked only total length. A second invocation failed with `expected one attempt` because the state at [paymentAttempts.js:1](../../../evals/audit-fixture/src/paymentAttempts.js#L1) is global and has no reset mechanism.
- The repository’s configured test command targets another directory at [package.json:10](../../../package.json#L10).

Thus the suite can appear green while retry, conflict, invalid-status, mutation, and isolation behavior remain untested.

Safest fix: register real `node:test` cases, include the fixture in an executed test command, and isolate storage per test. Add same-key replay, conflicting replay, invalid/missing status, mutation, and lifecycle tests.

## Rejected candidates

- **The returned array itself exposes storage:** rejected. Adding or removing elements from the returned array did not change internal membership because `[...attempts]` creates a new outer array. Only the contained record references remain live.
- **An actual duplicate charge is proven:** rejected as a confirmed outcome. The fixture proves duplicate attempt records, but contains no processor or downstream execution path.
- **Same-instance sequential ID collision:** rejected. Sequential calls produced `attempt_1` and `attempt_2`. Restart and multi-worker uniqueness remain unknown.

## Coverage gaps

- No payment processor, persistence layer, transaction boundary, deployment topology, or downstream caller exists in scope.
- No concurrency, restart, or multi-worker behavior can be exercised.
- Invoice/key requirements, monetary bounds, currency semantics, authentication, and authorization are undocumented and were outside the requested focus.
- No external test harness was available; an external consumer could manually invoke the exported test, but that would still cover only the single-create happy path.

## Unknowns

- The intended scope and retention period of `paymentKey`.
- Which fields must be bound to an idempotency key and how conflicting reuse should fail.
- The permitted status set and legal transitions.
- Whether attempts must survive restarts or coordinate across workers.
- Whether duplicate stored attempts are independently processed downstream.

## Workflow Trace

- **Mode:** single-agent multi-lens.
- **Subagents:** none; the user explicitly prohibited spawning them.
- **Lenses:** retry correctness, idempotency/data integrity, status validation, API reference ownership, tests, runtime behavior, and README-versus-source claims.
- **Verification:** complete source reads, caller/harness searches, isolated Node probes, direct execution, and `node --test`.
- **Authority:** read-only. No files were edited; target hashes remained unchanged.
