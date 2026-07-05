import { FooPaymentAttempt, serializeFooPaymentAttempt } from "../src/payment.js";

export function testSerializeFooPaymentAttempt() {
  const attempt = new FooPaymentAttempt("inv_1", 1000);
  const serialized = serializeFooPaymentAttempt(attempt);

  if (serialized.type !== "FooPaymentAttempt") {
    throw new Error("expected FooPaymentAttempt type");
  }
}

