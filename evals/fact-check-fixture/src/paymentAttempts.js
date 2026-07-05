export function createPaymentAttempt(store, input) {
  const attempt = {
    id: `attempt_${store.length + 1}`,
    invoiceId: input.invoiceId,
    status: input.status,
    amountCents: input.amountCents
  };

  store.push(attempt);
  return attempt;
}

