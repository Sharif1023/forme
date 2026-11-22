import { z } from "zod";
import { query, withTransaction } from "./db/pool.mjs";
import { jsonValue, audit } from "./audit.mjs";
import { decryptSecret, encryptSecret } from "./security.mjs";
import { ApiError, invalid } from "./errors.mjs";

export const DEFAULT_SETTINGS = {
  shop: {
    name: "FORME",
    contactEmail: "",
    contactPhone: "",
    address: "",
    announcement: "",
    currency: "BDT",
  },
  shipping: {
    standardFeePaise: 10000,
    freeShippingThresholdPaise: 500000,
    insideDhakaPaise: 8000,
    outsideDhakaPaise: 13000,
    freeAbovePaise: 500000,
  },
  payments: {
    cod: { enabled: true },
    bkash: { enabled: false, mode: "gateway", accountNumber: "", instructions: "" },
    nagad: { enabled: false, mode: "gateway", accountNumber: "", instructions: "" },
    bank: {
      enabled: false,
      accountName: "",
      bankName: "",
      accountNumber: "",
      branchName: "",
      routingNumber: "",
      instructions: "",
    },
    sslcommerz: { enabled: false, environment: "sandbox", storeId: "", storePassword: "" },
  },
};
const text = z.string().max(2000);
const mobile = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(["gateway", "manual"]),
    accountNumber: z.string().max(64),
    instructions: text,
  })
  .strict();
const settingsSchema = z
  .object({
    shop: z
      .object({
        name: z.string().trim().min(1).max(180),
        contactEmail: z
          .string()
          .max(254)
          .refine(
            (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
            "Enter a valid email.",
          ),
        contactPhone: z.string().max(32),
        address: text,
        announcement: text,
        currency: z.literal("BDT"),
      })
      .strict(),
    shipping: z
      .object({
        standardFeePaise: z.number().int().min(0).max(10000000),
        freeShippingThresholdPaise: z.number().int().min(0).max(1000000000),
        insideDhakaPaise: z.number().int().min(0).max(10000000),
        outsideDhakaPaise: z.number().int().min(0).max(10000000),
        freeAbovePaise: z.number().int().min(0).max(1000000000),
      })
      .strict(),
    payments: z
      .object({
        cod: z.object({ enabled: z.boolean() }).strict(),
        bkash: mobile,
        nagad: mobile,
        bank: z
          .object({
            enabled: z.boolean(),
            accountName: z.string().max(180),
            bankName: z.string().max(180),
            accountNumber: z.string().max(100),
            branchName: z.string().max(180),
            routingNumber: z.string().max(40),
            instructions: text,
          })
          .strict(),
        sslcommerz: z
          .object({
            enabled: z.boolean(),
            environment: z.enum(["sandbox", "live"]),
            storeId: z.string().max(4096),
            storePassword: z.string().max(4096),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export async function getSettings(connection) {
  const rows = await query(
    "SELECT setting_key,value_json FROM settings WHERE setting_key IN ('shop','shipping','payments')",
    [],
    connection,
  );
  const settings = structuredClone(DEFAULT_SETTINGS);
  for (const row of rows) {
    const value = jsonValue(row.value_json, {});
    if (row.setting_key === "payments") {
      for (const key of Object.keys(settings.payments))
        settings.payments[key] = { ...settings.payments[key], ...(value[key] || {}) };
    } else settings[row.setting_key] = { ...settings[row.setting_key], ...value };
  }
  return settings;
}
export async function maskedSettings(connection) {
  const settings = await getSettings(connection);
  const gateway = settings.payments.sslcommerz;
  gateway.configured = !!gateway.storeId && !!gateway.storePassword;
  gateway.storeId = gateway.storeId ? "********" : "";
  gateway.storePassword = gateway.storePassword ? "********" : "";
  return settings;
}
export async function getPaymentConfig(provider, { includeSecrets = false, connection } = {}) {
  const config = (await getSettings(connection)).payments[provider];
  if (!config) throw invalid("That payment method is not supported.");
  if (provider === "sslcommerz") {
    const configured = !!config.storeId && !!config.storePassword;
    return {
      ...config,
      configured,
      storeId:
        includeSecrets && configured ? decryptSecret(config.storeId) : configured ? "********" : "",
      storePassword:
        includeSecrets && configured
          ? decryptSecret(config.storePassword)
          : configured
            ? "********"
            : "",
    };
  }
  return config;
}

export async function publicSettings() {
  const settings = await getSettings();
  const gateway = settings.payments.sslcommerz;
  const gatewayReady = gateway.enabled && !!gateway.storeId && !!gateway.storePassword;
  const methods = {};
  for (const method of ["cod", "bkash", "nagad", "bank"]) {
    const value = settings.payments[method];
    const ready =
      method === "cod"
        ? true
        : method === "bank"
          ? !!value.accountNumber && !!value.bankName
          : value.mode === "manual"
            ? !!value.accountNumber
            : gatewayReady;
    methods[method] = {
      ...value,
      mode: method === "bank" ? "manual" : value.mode,
      ...(method === "bank" ? { branch: value.branchName } : {}),
      enabled: !!value.enabled && ready,
    };
  }
  return {
    shop: {
      ...settings.shop,
      email: settings.shop.contactEmail,
      phone: settings.shop.contactPhone,
    },
    shipping: settings.shipping,
    payments: methods,
    currency: "BDT",
  };
}

export async function updateSettings(input, actor) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw invalid("Settings must be an object.");
  if (Object.keys(input).some((key) => !["shop", "shipping", "payments"].includes(key)))
    throw invalid("Unknown settings group.");
  if (input.payments && !["owner", "admin"].includes(actor.role))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only an owner or administrator can change payment settings.",
    );
  return withTransaction(async (connection) => {
    await query(
      "SELECT setting_key FROM settings WHERE setting_key IN ('shop','shipping','payments') FOR UPDATE",
      [],
      connection,
    );
    const settings = await getSettings(connection);
    for (const group of ["shop", "shipping"])
      if (input[group]) settings[group] = { ...settings[group], ...input[group] };
    if (input.shipping?.standardFeePaise !== undefined) {
      if (input.shipping.insideDhakaPaise === undefined)
        settings.shipping.insideDhakaPaise = input.shipping.standardFeePaise;
      if (input.shipping.outsideDhakaPaise === undefined)
        settings.shipping.outsideDhakaPaise = input.shipping.standardFeePaise;
    }
    if (
      input.shipping?.freeShippingThresholdPaise !== undefined &&
      input.shipping.freeAbovePaise === undefined
    )
      settings.shipping.freeAbovePaise = input.shipping.freeShippingThresholdPaise;
    if (input.payments) {
      if (Object.keys(input.payments).some((key) => !Object.hasOwn(settings.payments, key)))
        throw invalid("Unknown payment method.");
      for (const [key, patch] of Object.entries(input.payments)) {
        if (!patch || typeof patch !== "object" || Array.isArray(patch))
          throw invalid("Invalid payment settings.");
        const clean = { ...patch };
        delete clean.configured;
        if (key === "sslcommerz")
          for (const secret of ["storeId", "storePassword"]) {
            if (clean[secret] === "********") delete clean[secret];
            else if (typeof clean[secret] === "string" && clean[secret])
              clean[secret] = encryptSecret(clean[secret]);
          }
        settings.payments[key] = { ...settings.payments[key], ...clean };
      }
    }
    settingsSchema.parse(settings);
    const gateway = settings.payments.sslcommerz;
    if (gateway.enabled && (!gateway.storeId || !gateway.storePassword))
      throw invalid("Add both gateway credentials before enabling SSLCommerz.");
    for (const method of ["bkash", "nagad"]) {
      const value = settings.payments[method];
      if (value.enabled && value.mode === "manual" && !value.accountNumber)
        throw invalid(`Add the ${method} receiving account before enabling it.`);
      if (
        value.enabled &&
        value.mode === "gateway" &&
        (!gateway.enabled || !gateway.storeId || !gateway.storePassword)
      )
        throw invalid(
          `Configure and enable SSLCommerz before enabling ${method} gateway payments.`,
        );
    }
    if (
      settings.payments.bank.enabled &&
      (!settings.payments.bank.bankName || !settings.payments.bank.accountNumber)
    )
      throw invalid("Add the bank name and account number before enabling bank transfer.");
    for (const [key, value] of Object.entries(settings))
      await query(
        "INSERT INTO settings (setting_key,value_json) VALUES (?,?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)",
        [key, JSON.stringify(value)],
        connection,
      );
    await audit(
      actor,
      "settings.updated",
      "settings",
      null,
      { groups: Object.keys(input) },
      connection,
    );
    return maskedSettings(connection);
  });
}
