import { createPaymentAttempt } from "../src/paymentAttempts.js";

export function testCreatesPaymentAttempt() {
  const store = [];
  const attempt = createPaymentAttempt(store, {
    invoiceId: "inv_1",
    status: "pending",
    amountCents: 500
  });

  if (attempt.id !== "attempt_1") {
    throw new Error("expected first attempt id");
  }

  if (store.length !== 1) {
    throw new Error("expected one stored attempt");
  }
}

