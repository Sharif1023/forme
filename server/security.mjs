import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config.mjs";
import { ApiError } from "./errors.mjs";

const scryptAsync = promisify(scrypt);
export const randomToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");
export const csrfForSession = (token) =>
  createHmac("sha256", config.sessionSecret).update(token).digest("base64url");
export function equalSecret(first, second) {
  if (typeof first !== "string" || typeof second !== "string") return false;
  const a = Buffer.from(first),
    b = Buffer.from(second);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$32768$${salt}$${Buffer.from(derived).toString("hex")}`;
}
export async function verifyPassword(password, hash) {
  const [kind, cost, salt, expected] = String(hash).split("$");
  if (kind !== "scrypt" || cost !== "32768" || !salt || !expected) return false;
  const actual = await scryptAsync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return equalSecret(Buffer.from(actual).toString("hex"), expected);
}
function encryptionKey() {
  const value = config.encryptionKey;
  const key = /^[a-f\d]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.length !== 32)
    throw new ApiError(
      503,
      "ENCRYPTION_NOT_CONFIGURED",
      "Secure payment credential storage needs a configured 32-byte ENCRYPTION_KEY.",
    );
  return key;
}
export function encryptSecret(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}
export function decryptSecret(value) {
  if (!value) return "";
  if (!String(value).startsWith("enc:v1:"))
    throw new ApiError(
      503,
      "INVALID_CREDENTIAL_STORAGE",
      "Stored payment credentials need administrator attention.",
    );
  const [, , iv, tag, encrypted] = value.split(":");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ApiError(
      503,
      "CREDENTIAL_DECRYPTION_FAILED",
      "Stored payment credentials need administrator attention.",
    );
  }
}
