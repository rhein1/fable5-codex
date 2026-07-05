import { createPaymentAttempt, listPaymentAttempts } from "../src/paymentAttempts.js";

export function testPaymentAttemptCreated() {
  createPaymentAttempt({
    invoiceId: "inv_1",
    paymentKey: "idem_1",
    amountCents: 1000,
    status: "pending"
  });

  if (listPaymentAttempts().length !== 1) {
    throw new Error("expected one attempt");
  }
}

