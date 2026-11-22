import assert from "node:assert/strict";
import test from "node:test";
import { createManualPaymentSubmission, normalizeTransactionId } from "./manual.mjs";

test("manual references canonicalize case and separators for a unique database key", () => {
  for (const reference of [
    "ab123456",
    " AB12-3456 ",
    "AB12/3456",
    "AB12_3456",
    "ＡＢ１２３４５６",
  ]) {
    assert.equal(normalizeTransactionId(reference), "AB123456");
  }
});

test("invalid or excessive manual references are rejected", () => {
  for (const reference of [
    undefined,
    123456,
    "12345",
    "A".repeat(121),
    "<script>1234</script>",
    "AB123\n456",
    "AB123💳456",
    "-------",
  ]) {
    assert.throws(() => normalizeTransactionId(reference), { code: "PAYMENT_REFERENCE_INVALID" });
  }
});

test("manual bKash and Nagad references remain pending until reviewed", () => {
  for (const method of ["bkash", "nagad"]) {
    const result = createManualPaymentSubmission({
      method,
      transactionId: "AB12-3456",
      senderPhone: "01712-345678",
      amountMinor: 12_345,
      expectedTotalMinor: 12_345,
    });
    assert.equal(result.transactionId, "AB123456");
    assert.equal(result.senderPhone, "+8801712345678");
    assert.equal(result.paymentStatus, "pending");
    assert.equal(result.requiresReview, true);
  }
});

test("bank transfer evidence may omit a sender mobile but cannot mark paid", () => {
  const result = createManualPaymentSubmission({
    method: "bank",
    transactionId: "BANK/123456",
    expectedTotalMinor: 12_345,
  });
  assert.equal(result.paymentStatus, "pending");
  assert.equal(result.senderPhone, null);
  assert.equal(result.requiresReview, true);
});

test("manual proof validates expected amount, method and mobile sender", () => {
  const input = {
    method: "bkash",
    transactionId: "AB123456",
    senderPhone: "+8801712345678",
    expectedTotalMinor: 12_345,
  };
  assert.throws(() => createManualPaymentSubmission({ ...input, amountMinor: 12_344 }), {
    code: "PAYMENT_AMOUNT_MISMATCH",
  });
  assert.throws(() => createManualPaymentSubmission({ ...input, expectedTotalMinor: 0 }), {
    code: "PAYMENT_AMOUNT_INVALID",
  });
  assert.throws(() => createManualPaymentSubmission({ ...input, method: "cod" }), {
    code: "PAYMENT_METHOD_INVALID",
  });
  assert.throws(() => createManualPaymentSubmission({ ...input, senderPhone: "" }), {
    code: "PAYMENT_SENDER_INVALID",
  });
  assert.throws(() => createManualPaymentSubmission({ ...input, senderPhone: "01212345678" }), {
    code: "PAYMENT_SENDER_INVALID",
  });
});
