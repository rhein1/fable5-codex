export class FooPaymentAttempt {
  constructor(invoiceId, amountCents) {
    this.invoiceId = invoiceId;
    this.amountCents = amountCents;
  }
}

export function serializeFooPaymentAttempt(attempt) {
  return {
    type: "FooPaymentAttempt",
    invoiceId: attempt.invoiceId,
    amountCents: attempt.amountCents
  };
}

