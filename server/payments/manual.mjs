import { PaymentError } from "./sslcommerz.mjs";

/** Use this canonical reference in a UNIQUE database index before accepting manual proof. */
export function normalizeTransactionId(raw) {
  if (typeof raw !== "string" || raw.length > 120 || /[\x00-\x1f\x7f]/.test(raw)) {
    throw new PaymentError(
      "PAYMENT_REFERENCE_INVALID",
      "Enter the transaction reference shown in your payment receipt.",
      422,
    );
  }
  const value = raw.normalize("NFKC").trim().toUpperCase();
  if (!/^[A-Z0-9 /_-]+$/.test(value)) {
    throw new PaymentError(
      "PAYMENT_REFERENCE_INVALID",
      "The transaction reference may only contain letters, numbers, spaces, slashes and hyphens.",
      422,
    );
  }
  const normalized = value.replace(/[ /_-]/g, "");
  if (!/^[A-Z0-9]{6,64}$/.test(normalized)) {
    throw new PaymentError(
      "PAYMENT_REFERENCE_INVALID",
      "The transaction reference must contain between 6 and 64 letters or numbers.",
      422,
    );
  }
  return normalized;
}

function normalizeSenderPhone(raw, required) {
  if ((raw === undefined || raw === null || raw === "") && !required) return null;
  if (typeof raw !== "string")
    throw new PaymentError(
      "PAYMENT_SENDER_INVALID",
      "Enter the mobile number used to send the payment.",
      422,
    );
  const phone = raw.replace(/[ ()-]/g, "");
  if (!/^(?:\+?88)?01[3-9]\d{8}$/.test(phone)) {
    throw new PaymentError(
      "PAYMENT_SENDER_INVALID",
      "Enter a valid Bangladeshi mobile number used for the payment.",
      422,
    );
  }
  return `+88${phone.replace(/^(?:\+?88)/, "")}`;
}

/** A submitted reference is unverified evidence; only an admin review can settle it. */
export function createManualPaymentSubmission({
  method,
  transactionId,
  senderPhone,
  amountMinor,
  expectedTotalMinor,
}) {
  if (!["bkash", "nagad", "bank"].includes(method)) {
    throw new PaymentError(
      "PAYMENT_METHOD_INVALID",
      "Choose bKash, Nagad or bank transfer for a manual payment.",
      422,
    );
  }
  if (!Number.isSafeInteger(expectedTotalMinor) || expectedTotalMinor <= 0) {
    throw new PaymentError(
      "PAYMENT_AMOUNT_INVALID",
      "The stored order payment amount is invalid.",
      422,
    );
  }
  if (
    amountMinor !== undefined &&
    (!Number.isSafeInteger(amountMinor) || amountMinor !== expectedTotalMinor)
  ) {
    throw new PaymentError(
      "PAYMENT_AMOUNT_MISMATCH",
      "The payment amount must match the order total.",
      422,
    );
  }
  const normalized = normalizeTransactionId(transactionId);
  return {
    method,
    transactionId: normalized,
    reference: normalized,
    senderPhone: normalizeSenderPhone(senderPhone, method !== "bank"),
    amountMinor: expectedTotalMinor,
    paymentStatus: "pending",
    requiresReview: true,
  };
}
