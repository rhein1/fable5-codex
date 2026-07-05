const attempts = [];

export function createPaymentAttempt(input) {
  const attempt = {
    id: `attempt_${attempts.length + 1}`,
    invoiceId: input.invoiceId,
    paymentKey: input.paymentKey,
    amountCents: input.amountCents,
    status: input.status
  };

  attempts.push(attempt);
  return attempt;
}

export function listPaymentAttempts() {
  return [...attempts];
}

