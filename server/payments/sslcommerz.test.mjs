import assert from "node:assert/strict";
import test from "node:test";
import {
  assessVerifiedPayment,
  createSslcommerzAdapter,
  decimalToMinor,
  minorToDecimal,
  PaymentError,
  validateCheckoutEligibility,
} from "./sslcommerz.mjs";

const config = {
  enabled: true,
  environment: "sandbox",
  storeId: "merchant-test",
  storePassword: "server-secret-only",
};
const sessionInput = {
  order: { id: "order-1", orderNumber: "FORME-1001", gatewayTransactionId: "payment-1" },
  totalMinor: 12_345,
  currency: "BDT",
  customer: {
    name: "Buyer Name",
    email: "buyer@example.com",
    phone: "01712345678",
    address: "14 Test Road",
    city: "Dhaka",
    postalCode: "1205",
  },
  items: [{ name: "Linen Camp Shirt", quantity: 1, unitPricePaise: 12_345 }],
  method: "bkash",
  callbackBase: "https://shop.example.com/api/payments/sslcommerz",
  config,
};
const validation = {
  status: "VALID",
  val_id: "validation-1",
  tran_id: "payment-1",
  amount: "123.45",
  currency: "BDT",
  currency_type: "BDT",
  currency_amount: "123.45",
  bank_tran_id: "bank-transaction-1",
  risk_level: "0",
  risk_title: "Safe",
};
const expected = {
  transactionId: "payment-1",
  totalMinor: 12_345,
  currency: "BDT",
  sessionKey: "session-1",
};
const jsonResponse = (data, ok = true) => ({ ok, text: async () => JSON.stringify(data) });
const code = (expectedCode) => (error) =>
  error instanceof PaymentError && error.code === expectedCode;

test("checkout eligibility applies gateway email and amount limits without contacting a provider", () => {
  for (const totalMinor of [1000, 50_000_000])
    assert.doesNotThrow(() => validateCheckoutEligibility({ ...sessionInput, totalMinor }));
  for (const totalMinor of [0, 999, 50_000_001])
    assert.throws(
      () => validateCheckoutEligibility({ ...sessionInput, totalMinor }),
      code("PAYMENT_AMOUNT_INVALID"),
    );
  assert.throws(
    () =>
      validateCheckoutEligibility({
        ...sessionInput,
        customer: { ...sessionInput.customer, email: `${"x".repeat(45)}@example.com` },
      }),
    code("PAYMENT_CUSTOMER_EMAIL_REQUIRED"),
  );
});

test("money conversion uses integer paisa without floating point rounding", () => {
  assert.equal(minorToDecimal(12_345), "123.45");
  assert.equal(minorToDecimal(10), "0.10");
  assert.equal(decimalToMinor("123.45"), 12_345);
  assert.equal(decimalToMinor("123.4"), 12_340);
  assert.equal(decimalToMinor("0.01"), 1);
  for (const value of [
    "1.001",
    "1e3",
    "-1",
    "Infinity",
    "NaN",
    "1,000.00",
    {},
    "900719925474099200.00",
  ]) {
    assert.throws(() => decimalToMinor(value), code("PAYMENT_AMOUNT_INVALID"));
  }
  assert.throws(() => minorToDecimal(1.5), code("PAYMENT_AMOUNT_INVALID"));
});

test("disabled or incomplete admin configuration never contacts a gateway", async () => {
  let calls = 0;
  const adapter = createSslcommerzAdapter({
    fetchImpl: async () => {
      calls++;
      throw new Error("unexpected network");
    },
  });
  for (const bad of [
    undefined,
    {},
    { ...config, enabled: false },
    { ...config, storeId: "" },
    { ...config, storePassword: "" },
    { ...config, environment: "https://malicious.example" },
  ]) {
    await assert.rejects(adapter.createSession({ ...sessionInput, config: bad }), PaymentError);
    await assert.rejects(adapter.validatePayment("validation-1", bad), PaymentError);
  }
  assert.equal(calls, 0);
});

test("hosted checkout posts server credentials and exact totals to the fixed provider origin", async () => {
  let request;
  const adapter = createSslcommerzAdapter({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({
        status: "SUCCESS",
        sessionkey: "session-1",
        GatewayPageURL: "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?SESSIONKEY=session-1",
      });
    },
  });
  const result = await adapter.createSession({
    ...sessionInput,
    config: { ...config, baseUrl: "https://evil.example" },
  });
  assert.equal(request.url, "https://sandbox.sslcommerz.com/gwprocess/v4/api.php");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.redirect, "error");
  assert.ok(request.options.signal instanceof AbortSignal);
  const form = new URLSearchParams(request.options.body);
  assert.equal(form.get("store_passwd"), config.storePassword);
  assert.equal(form.get("total_amount"), "123.45");
  assert.equal(form.get("currency"), "BDT");
  assert.equal(form.get("tran_id"), "payment-1");
  assert.equal(form.get("product_profile"), "physical-goods");
  assert.equal(form.get("success_url"), `${sessionInput.callbackBase}/success`);
  assert.equal(form.get("ipn_url"), `${sessionInput.callbackBase}/ipn`);
  assert.equal(form.get("multi_card_name"), null);
  assert.equal(result.sessionKey, "session-1");
  assert.equal(result.transactionId, "payment-1");
  assert.equal(JSON.stringify(result).includes(config.storePassword), false);
});

test("the live environment uses only the live origin", async () => {
  let destination;
  const adapter = createSslcommerzAdapter({
    fetchImpl: async (url) => {
      destination = url;
      return jsonResponse({
        status: "SUCCESS",
        sessionkey: "live-session",
        GatewayPageURL:
          "https://securepay.sslcommerz.com/gwprocess/v4/gw.php?SESSIONKEY=live-session",
      });
    },
  });
  await adapter.createSession({
    ...sessionInput,
    method: "nagad",
    config: { ...config, environment: "live" },
  });
  assert.equal(destination, "https://securepay.sslcommerz.com/gwprocess/v4/api.php");
});

test("invalid input is rejected before checkout contacts the provider", async () => {
  let calls = 0;
  const adapter = createSslcommerzAdapter({
    fetchImpl: async () => {
      calls++;
      return jsonResponse({});
    },
  });
  for (const update of [
    { currency: "USD" },
    { totalMinor: 999 },
    { totalMinor: 50_000_001 },
    { totalMinor: 1234.5 },
    { method: "cod" },
    { customer: { ...sessionInput.customer, email: "" } },
    { items: [] },
    { items: [{ quantity: 0 }] },
    { order: { gatewayTransactionId: "long".repeat(10) } },
    { callbackBase: "http://shop.example.com/callback" },
    { callbackBase: "https://user:secret@shop.example.com/callback" },
    { callbackBase: "https://shop.example.com/callback?next=evil" },
  ])
    await assert.rejects(adapter.createSession({ ...sessionInput, ...update }), PaymentError);
  assert.equal(calls, 0);
});

test("a sandbox callback may use localhost HTTP for development only", async () => {
  const adapter = createSslcommerzAdapter({
    fetchImpl: async () =>
      jsonResponse({
        status: "SUCCESS",
        sessionkey: "session-1",
        GatewayPageURL: "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php",
      }),
  });
  await adapter.createSession({
    ...sessionInput,
    callbackBase: "http://localhost:4000/api/payments/sslcommerz",
  });
  await assert.rejects(
    adapter.createSession({
      ...sessionInput,
      callbackBase: "http://localhost:4000/api/payments/sslcommerz",
      config: { ...config, environment: "live" },
    }),
    code("PAYMENT_CALLBACK_INVALID"),
  );
});

test("provider checkout redirects cannot send a customer to an arbitrary domain", async () => {
  for (const url of [
    "https://evil.example/gwprocess/pay",
    "https://sandbox.sslcommerz.com.evil.example/gwprocess/pay",
    "http://sandbox.sslcommerz.com/gwprocess/pay",
    "https://sandbox.sslcommerz.com:444/gwprocess/pay",
    "https://user:secret@sandbox.sslcommerz.com/gwprocess/pay",
    "https://securepay.sslcommerz.com/gwprocess/pay",
    "https://sandbox.sslcommerz.com/elsewhere",
  ]) {
    const adapter = createSslcommerzAdapter({
      fetchImpl: async () =>
        jsonResponse({ status: "SUCCESS", sessionkey: "session-1", GatewayPageURL: url }),
    });
    await assert.rejects(adapter.createSession(sessionInput), code("PAYMENT_REDIRECT_REJECTED"));
  }
});

test("authoritative validation is GET and checks the validation reference", async () => {
  let request;
  const adapter = createSslcommerzAdapter({
    fetchImpl: async (url, options) => {
      request = { url: new URL(url), options };
      return jsonResponse(validation);
    },
  });
  const verified = await adapter.validatePayment("validation-1", config);
  assert.equal(request.url.origin, "https://sandbox.sslcommerz.com");
  assert.equal(request.url.pathname, "/validator/api/validationserverAPI.php");
  assert.equal(request.url.searchParams.get("store_passwd"), config.storePassword);
  assert.equal(request.url.searchParams.get("val_id"), "validation-1");
  assert.equal(request.options.method, "GET");
  assert.ok(Object.isFrozen(verified));
  assert.equal(verified.amountMinor, 12_345);
  assert.equal(assessVerifiedPayment(verified, expected).paymentStatus, "paid");
  assert.equal(JSON.stringify(verified).includes(config.storePassword), false);
});

test("VALIDATED replay is acceptable evidence; repository finalization remains idempotent", async () => {
  const adapter = createSslcommerzAdapter({
    fetchImpl: async () => jsonResponse({ ...validation, status: "VALIDATED" }),
  });
  const verified = await adapter.validatePayment("validation-1", config);
  assert.equal(assessVerifiedPayment(verified, expected).paymentStatus, "paid");
});

test("a raw success callback or a copied validation object cannot mark an order paid", async () => {
  assert.throws(() => assessVerifiedPayment(validation, expected), code("PAYMENT_UNVERIFIED"));
  const adapter = createSslcommerzAdapter({ fetchImpl: async () => jsonResponse(validation) });
  const verified = await adapter.validatePayment("validation-1", config);
  assert.throws(() => assessVerifiedPayment({ ...verified }, expected), code("PAYMENT_UNVERIFIED"));
});

test("amount, order, currency and returned session mismatches are rejected", async () => {
  const variants = [
    [{ amount: "123.44" }, "PAYMENT_AMOUNT_MISMATCH"],
    [{ currency_amount: "123.44" }, "PAYMENT_AMOUNT_MISMATCH"],
    [{ tran_id: "different-order" }, "PAYMENT_TRANSACTION_MISMATCH"],
    [{ currency: "USD" }, "PAYMENT_CURRENCY_MISMATCH"],
    [{ currency: "BDT-USD" }, "PAYMENT_CURRENCY_MISMATCH"],
    [{ currency_type: "USD" }, "PAYMENT_CURRENCY_MISMATCH"],
    [{ currency_type: "BDT-USD" }, "PAYMENT_CURRENCY_MISMATCH"],
    [{ sessionkey: "different-session" }, "PAYMENT_SESSION_MISMATCH"],
  ];
  for (const [update, errorCode] of variants) {
    const adapter = createSslcommerzAdapter({
      fetchImpl: async () => jsonResponse({ ...validation, ...update }),
    });
    const verified = await adapter.validatePayment("validation-1", config);
    assert.throws(() => assessVerifiedPayment(verified, expected), code(errorCode));
  }
});

test("high or unknown risk is held for review instead of automatically paid", async () => {
  for (const risk of ["1", undefined, "", "unexpected"]) {
    const adapter = createSslcommerzAdapter({
      fetchImpl: async () => jsonResponse({ ...validation, risk_level: risk, risk_title: "" }),
    });
    const verified = await adapter.validatePayment("validation-1", config);
    const assessment = assessVerifiedPayment(verified, expected);
    assert.equal(assessment.paymentStatus, "review");
    assert.equal(assessment.requiresReview, true);
    assert.ok(assessment.reviewReason);
  }
});

test("invalid statuses, missing bank reference and wrong validator IDs cannot settle a payment", async () => {
  for (const update of [
    { status: "PENDING" },
    { status: "FAILED" },
    { status: "INVALID_TRANSACTION" },
    { val_id: "another-reference" },
    { bank_tran_id: "" },
  ]) {
    const adapter = createSslcommerzAdapter({
      fetchImpl: async () => jsonResponse({ ...validation, ...update }),
    });
    await assert.rejects(adapter.validatePayment("validation-1", config), PaymentError);
  }
});

test("timeouts and transport failures are bounded and never expose credentials", async () => {
  const hanging = createSslcommerzAdapter({
    fetchImpl: async () => new Promise(() => {}),
    timeoutMs: 5,
  });
  await assert.rejects(
    hanging.validatePayment("validation-1", config),
    code("PAYMENT_PROVIDER_TIMEOUT"),
  );
  const failed = createSslcommerzAdapter({
    fetchImpl: async (url) => {
      throw new Error(`Network error for ${url}`);
    },
  });
  await assert.rejects(failed.validatePayment("validation-1", config), (error) => {
    assert.equal(error.code, "PAYMENT_PROVIDER_UNAVAILABLE");
    assert.equal(String(error).includes(config.storePassword), false);
    assert.equal(error.cause, undefined);
    return true;
  });
});

test("invalid JSON and unsuccessful provider sessions return safe errors", async () => {
  const badJson = createSslcommerzAdapter({
    fetchImpl: async () => ({ ok: true, text: async () => "<html>unavailable</html>" }),
  });
  await assert.rejects(
    badJson.createSession(sessionInput),
    code("PAYMENT_PROVIDER_RESPONSE_INVALID"),
  );
  const failed = createSslcommerzAdapter({
    fetchImpl: async () => jsonResponse({ status: "FAILED", failedreason: config.storePassword }),
  });
  await assert.rejects(failed.createSession(sessionInput), (error) => {
    assert.equal(error.code, "PAYMENT_SESSION_FAILED");
    assert.equal(error.message.includes(config.storePassword), false);
    return true;
  });
});
