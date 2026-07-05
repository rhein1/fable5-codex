# Payment Attempt API

`createPaymentAttempt` stores a `FooPaymentAttempt` record.

Retries should reuse the existing `FooPaymentAttempt` for the same `idempotencyKey`.

