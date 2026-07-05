# Toy Buggy Repo

This toy repo is intentionally small and flawed. Use it to smoke-test `$fable-audit`, `$fable-fact-check`, and `$fable-sweep`.

Claims:

- Payment attempts are idempotent.
- Duplicate retry submissions reuse the original attempt.
- Serialized payment attempt records use `FooPaymentAttempt`.

