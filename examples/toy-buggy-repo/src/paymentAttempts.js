const attempts = [];

export function createPaymentAttempt(input) {
  const attempt = {
    id: `attempt_${attempts.length + 1}`,
    invoiceId: input.invoiceId,
    idempotencyKey: input.idempotencyKey,
    amountCents: input.amountCents,
    type: "FooPaymentAttempt"
  };

  attempts.push(attempt);
  return attempt;
}

export function allPaymentAttempts() {
  return attempts.slice();
}

