/**
 * Server-only SSLCOMMERZ hosted checkout adapter.
 * Provider contract: https://developer.sslcommerz.com/doc/v4/
 * Credentials come from decrypted admin settings; never import this module into browser code.
 */

const ORIGINS = Object.freeze({
  sandbox: "https://sandbox.sslcommerz.com",
  live: "https://securepay.sslcommerz.com",
});
const VERIFIED_RESULTS = new WeakSet();
const METHODS = new Set(["bkash", "nagad", "bank", "card", "gateway", "sslcommerz"]);
const MIN_TOTAL_MINOR = 1_000;
const MAX_TOTAL_MINOR = 50_000_000;
const DEFAULT_TIMEOUT_MS = 15_000;

export class PaymentError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
    this.status = status;
    this.httpStatus = status;
  }
}

function fail(code, message, status = 400) {
  throw new PaymentError(code, message, status);
}

function text(value, maxLength = 255) {
  return typeof value === "string"
    ? value
        .trim()
        .replace(/[\x00-\x1f\x7f]/g, "")
        .slice(0, maxLength)
    : "";
}

function settings(config) {
  if (!config || config.enabled !== true) {
    fail(
      "PAYMENT_GATEWAY_DISABLED",
      "Online payment is not enabled. Choose another payment method.",
      503,
    );
  }
  if (!Object.hasOwn(ORIGINS, config.environment)) {
    fail("PAYMENT_CONFIG_INVALID", "The payment environment must be sandbox or live.", 503);
  }
  const storeId = text(config.storeId, 120);
  const storePassword = text(config.storePassword, 120);
  if (!storeId || !storePassword) {
    fail(
      "PAYMENT_NOT_CONFIGURED",
      "Online payment credentials have not been configured by the store administrator.",
      503,
    );
  }
  return {
    storeId,
    storePassword,
    environment: config.environment,
    origin: ORIGINS[config.environment],
  };
}

export function minorToDecimal(minor) {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    fail("PAYMENT_AMOUNT_INVALID", "Payment amounts must be non-negative integers in paisa.");
  }
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

export function decimalToMinor(amount) {
  if (typeof amount !== "string" && typeof amount !== "number") {
    fail("PAYMENT_AMOUNT_INVALID", "The payment amount is invalid.");
  }
  const value = String(amount).trim();
  if (value.length > 32) fail("PAYMENT_AMOUNT_INVALID", "The payment amount is too large.");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match)
    fail("PAYMENT_AMOUNT_INVALID", "The payment amount must have at most two decimal places.");
  const minor = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER))
    fail("PAYMENT_AMOUNT_INVALID", "The payment amount is too large.");
  return Number(minor);
}

function callbackUrls(callbackBase, environment) {
  let base;
  try {
    base = new URL(callbackBase);
  } catch {
    fail("PAYMENT_CALLBACK_INVALID", "The payment callback URL is invalid.", 503);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.protocol !== "https:" &&
      !(environment === "sandbox" && local && base.protocol === "http:"))
  )
    fail("PAYMENT_CALLBACK_INVALID", "Payment callbacks require a secure public URL.", 503);
  const prefix = base.href.replace(/\/+$/, "");
  const urls = Object.fromEntries(
    ["success", "fail", "cancel", "ipn"].map((name) => [name, `${prefix}/${name}`]),
  );
  if (Object.values(urls).some((url) => url.length > 255)) {
    fail("PAYMENT_CALLBACK_INVALID", "The payment callback URL is too long.", 503);
  }
  return urls;
}

function transactionId(order) {
  const id = order?.gatewayTransactionId ?? order?.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,30}$/.test(id)) {
    fail(
      "PAYMENT_TRANSACTION_INVALID",
      "A unique gateway transaction ID of at most 30 characters is required.",
    );
  }
  return id;
}

function checkoutAmount(totalMinor, currency) {
  if (currency !== "BDT")
    fail("PAYMENT_CURRENCY_INVALID", "This store accepts payments in BDT only.");
  if (
    !Number.isSafeInteger(totalMinor) ||
    totalMinor < MIN_TOTAL_MINOR ||
    totalMinor > MAX_TOTAL_MINOR
  )
    fail("PAYMENT_AMOUNT_INVALID", "Online payment must be between ৳10 and ৳500,000.");
}

function checkoutCustomer(customer) {
  const email = text(customer?.email, 254);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 50) {
    fail(
      "PAYMENT_CUSTOMER_EMAIL_REQUIRED",
      "Enter a valid email address of at most 50 characters for online payment.",
    );
  }
  const name = text(customer?.name, 50);
  const phone = text(customer?.phone, 20);
  const address = text(customer?.address, 50);
  const city = text(customer?.city, 50);
  if (!name || !phone || !address || !city) {
    fail(
      "PAYMENT_CUSTOMER_INVALID",
      "Name, phone, shipping address and city are required for online payment.",
    );
  }
  return { name, email, phone, address, city, postalCode: text(customer.postalCode, 30) };
}

/** Validate before reserving stock; the adapter applies these same constraints. */
export function validateCheckoutEligibility({ totalMinor, currency = "BDT", customer }) {
  checkoutAmount(totalMinor, currency);
  checkoutCustomer(customer);
}

function allowedRedirect(rawUrl, origin) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(
      "PAYMENT_PROVIDER_RESPONSE_INVALID",
      "The payment provider did not return a valid checkout address.",
      502,
    );
  }
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/gwprocess/")
  ) {
    fail(
      "PAYMENT_REDIRECT_REJECTED",
      "The payment provider returned an unexpected checkout address.",
      502,
    );
  }
  return url.href;
}

async function requestJson(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  let timeout;
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(
        new PaymentError(
          "PAYMENT_PROVIDER_TIMEOUT",
          "The payment provider took too long to respond. Please try again.",
          504,
        ),
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, {
          ...options,
          signal: controller.signal,
          redirect: "error",
        });
        if (!response.ok)
          fail(
            "PAYMENT_PROVIDER_UNAVAILABLE",
            "The payment provider is temporarily unavailable.",
            502,
          );
        const body = await response.text();
        if (body.length > 128_000)
          fail(
            "PAYMENT_PROVIDER_RESPONSE_INVALID",
            "The payment provider returned an invalid response.",
            502,
          );
        let data;
        try {
          data = JSON.parse(body);
        } catch {
          fail(
            "PAYMENT_PROVIDER_RESPONSE_INVALID",
            "The payment provider returned an invalid response.",
            502,
          );
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          fail(
            "PAYMENT_PROVIDER_RESPONSE_INVALID",
            "The payment provider returned an invalid response.",
            502,
          );
        }
        return data;
      })(),
      timedOut,
    ]);
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    // Do not expose transport errors: a validation request URL contains store credentials.
    fail(
      controller.signal.aborted ? "PAYMENT_PROVIDER_TIMEOUT" : "PAYMENT_PROVIDER_UNAVAILABLE",
      "The payment provider could not be reached. Please try again.",
      controller.signal.aborted ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function createSslcommerzAdapter({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function")
    throw new TypeError("A server fetch implementation is required.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
    throw new TypeError("Invalid payment request timeout.");

  async function createSession({
    order,
    totalMinor,
    currency = "BDT",
    customer,
    items,
    method,
    config,
    callbackBase,
  }) {
    const gateway = settings(config);
    checkoutAmount(totalMinor, currency);
    if (!METHODS.has(method)) fail("PAYMENT_METHOD_INVALID", "Choose an online payment method.");
    const id = transactionId(order);
    const callbacks = callbackUrls(callbackBase, gateway.environment);
    const buyer = checkoutCustomer(customer);
    if (
      !Array.isArray(items) ||
      !items.length ||
      items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1)
    ) {
      fail("PAYMENT_ITEMS_INVALID", "The order must contain valid products.");
    }
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    if (!Number.isSafeInteger(itemCount))
      fail("PAYMENT_ITEMS_INVALID", "The order quantity is invalid.");
    const amount = minorToDecimal(totalMinor);
    const form = new URLSearchParams({
      store_id: gateway.storeId,
      store_passwd: gateway.storePassword,
      total_amount: amount,
      currency,
      tran_id: id,
      success_url: callbacks.success,
      fail_url: callbacks.fail,
      cancel_url: callbacks.cancel,
      ipn_url: callbacks.ipn,
      emi_option: "0",
      cus_name: buyer.name,
      cus_email: buyer.email,
      cus_phone: buyer.phone,
      cus_add1: buyer.address,
      cus_city: buyer.city,
      cus_postcode: buyer.postalCode,
      cus_country: "Bangladesh",
      shipping_method: "Courier",
      ship_name: buyer.name,
      ship_add1: buyer.address,
      ship_city: buyer.city,
      ship_postcode: buyer.postalCode,
      ship_country: "Bangladesh",
      num_of_item: String(itemCount),
      product_name: items
        .map((item) => text(item.name, 80) || "Clothing")
        .join(", ")
        .slice(0, 255),
      product_category: "clothing",
      product_profile: "physical-goods",
      value_a: text(order.orderNumber ?? order.id, 255),
      value_b: method,
    });
    // Do not force multi_card_name: channels (including Nagad) depend on the merchant's approved account.
    const data = await requestJson(
      fetchImpl,
      `${gateway.origin}/gwprocess/v4/api.php`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: form.toString(),
      },
      timeoutMs,
    );
    if (data.status !== "SUCCESS" || !text(data.sessionkey, 100)) {
      fail(
        "PAYMENT_SESSION_FAILED",
        "The payment provider could not start checkout. Check the store payment configuration or try again.",
        502,
      );
    }
    return {
      redirectUrl: allowedRedirect(data.GatewayPageURL, gateway.origin),
      sessionKey: text(data.sessionkey, 100),
      transactionId: id,
      environment: gateway.environment,
    };
  }

  async function validatePayment(valId, config) {
    const gateway = settings(config);
    if (typeof valId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(valId)) {
      fail("PAYMENT_VALIDATION_ID_INVALID", "The payment validation reference is invalid.");
    }
    const url = new URL(`${gateway.origin}/validator/api/validationserverAPI.php`);
    url.search = new URLSearchParams({
      val_id: valId,
      store_id: gateway.storeId,
      store_passwd: gateway.storePassword,
      v: "1",
      format: "json",
    }).toString();
    const data = await requestJson(
      fetchImpl,
      url.href,
      { method: "GET", headers: { accept: "application/json" } },
      timeoutMs,
    );
    if (!["VALID", "VALIDATED"].includes(data.status)) {
      fail("PAYMENT_NOT_VALID", "The payment provider has not confirmed this payment.", 409);
    }
    if (data.val_id !== valId)
      fail("PAYMENT_VALIDATION_MISMATCH", "The payment validation reference does not match.", 409);
    if (typeof data.tran_id !== "string" || !/^[A-Za-z0-9_-]{1,30}$/.test(data.tran_id)) {
      fail(
        "PAYMENT_PROVIDER_RESPONSE_INVALID",
        "The payment provider returned an invalid transaction reference.",
        502,
      );
    }
    const bankId = text(data.bank_tran_id, 80);
    if (!bankId)
      fail(
        "PAYMENT_PROVIDER_RESPONSE_INVALID",
        "The payment provider did not return a bank transaction reference.",
        502,
      );
    const verified = {
      status: data.status,
      val_id: data.val_id,
      tran_id: data.tran_id,
      amount: minorToDecimal(decimalToMinor(data.amount)),
      amountMinor: decimalToMinor(data.amount),
      currency: typeof data.currency === "string" ? data.currency.trim() : "",
      currency_type:
        typeof data.currency_type === "string" ? data.currency_type.trim() || null : null,
      currency_amount:
        data.currency_amount == null || data.currency_amount === ""
          ? null
          : minorToDecimal(decimalToMinor(data.currency_amount)),
      bank_tran_id: bankId,
      risk_level: String(data.risk_level ?? ""),
      risk_title: text(data.risk_title, 80),
      sessionkey: text(data.sessionkey, 100) || null,
      environment: gateway.environment,
    };
    VERIFIED_RESULTS.add(verified);
    return Object.freeze(verified);
  }

  return Object.freeze({ createSession, validatePayment });
}

/** Only accepts an object returned by this module's authoritative server-side validator. */
export function assessVerifiedPayment(
  verified,
  { transactionId: expectedId, totalMinor, currency = "BDT", sessionKey } = {},
) {
  if (!verified || !VERIFIED_RESULTS.has(verified)) {
    fail(
      "PAYMENT_UNVERIFIED",
      "The payment must be checked with the provider before it can be accepted.",
      409,
    );
  }
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0 || currency !== "BDT") {
    fail("PAYMENT_EXPECTATION_INVALID", "The stored order payment details are invalid.", 500);
  }
  if (verified.tran_id !== expectedId)
    fail("PAYMENT_TRANSACTION_MISMATCH", "The verified payment belongs to a different order.", 409);
  if (
    verified.currency !== currency ||
    (verified.currency_type && verified.currency_type !== currency)
  ) {
    fail(
      "PAYMENT_CURRENCY_MISMATCH",
      "The verified payment currency does not match the order.",
      409,
    );
  }
  if (
    verified.amountMinor !== totalMinor ||
    (verified.currency_amount !== null && decimalToMinor(verified.currency_amount) !== totalMinor)
  ) {
    fail(
      "PAYMENT_AMOUNT_MISMATCH",
      "The verified payment amount does not match the order total.",
      409,
    );
  }
  // The validation endpoint does not always include sessionkey; the merchant transaction ID is mandatory.
  if (sessionKey && verified.sessionkey && sessionKey !== verified.sessionkey) {
    fail("PAYMENT_SESSION_MISMATCH", "The verified payment session does not match the order.", 409);
  }
  const review = verified.risk_level !== "0";
  return {
    paymentStatus: review ? "review" : "paid",
    requiresReview: review,
    reviewReason: review
      ? verified.risk_title || "The provider has not classified this payment as safe."
      : null,
    transactionId: verified.tran_id,
    bankTransactionId: verified.bank_tran_id,
    validationId: verified.val_id,
    totalMinor: verified.amountMinor,
    currency: verified.currency,
    environment: verified.environment,
  };
}

const defaultAdapter = createSslcommerzAdapter();
export const createSession = defaultAdapter.createSession;
export const validatePayment = defaultAdapter.validatePayment;
