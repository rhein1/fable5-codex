import { allPaymentAttempts, createPaymentAttempt } from "../src/paymentAttempts.js";

export function testCreatesAttempt() {
  createPaymentAttempt({
    invoiceId: "inv_1",
    idempotencyKey: "retry_1",
    amountCents: 2500
  });

  if (allPaymentAttempts().length !== 1) {
    throw new Error("expected one attempt");
  }
}

