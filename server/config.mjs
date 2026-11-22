import "dotenv/config";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ephemeralSecret = randomBytes(32).toString("hex");
export const config = {
  port: Number(process.env.API_PORT || process.env.PORT || 4000),
  production: process.env.NODE_ENV === "production",
  databaseUrl: process.env.DATABASE_URL,
  dbHost: process.env.MYSQL_HOST || process.env.DB_HOST || "127.0.0.1",
  dbPort: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
  dbName: process.env.MYSQL_DATABASE || process.env.DB_NAME || "forme",
  dbUser: process.env.MYSQL_USER || process.env.DB_USER || "forme_app",
  dbPassword: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || "",
  sessionSecret: process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY || ephemeralSecret,
  encryptionKey: process.env.ENCRYPTION_KEY || "",
  publicBaseUrl: (
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    "http://127.0.0.1:5174"
  ).replace(/\/$/, ""),
  frontendBaseUrl: (
    process.env.APP_URL ||
    process.env.PUBLIC_BASE_URL ||
    "http://127.0.0.1:5174"
  ).replace(/\/$/, ""),
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS ||
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    "http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:4000"
  )
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
  cookieName: "forme_admin_session",
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  uploadDir: path.resolve(
    process.env.UPLOAD_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "../uploads"),
  ),
  reservationMinutes: Number(process.env.RESERVATION_MINUTES || 60),
};

export function validateRuntimeConfig() {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
    throw new Error("API_PORT must be a valid port.");
  if (!Number.isInteger(config.dbPort) || config.dbPort < 1 || config.dbPort > 65535)
    throw new Error("DB_PORT must be a valid port.");
  if (config.production && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32))
    throw new Error("A SESSION_SECRET of at least 32 characters is required in production.");
  if (config.production && !config.publicBaseUrl.startsWith("https://"))
    throw new Error("PUBLIC_BASE_URL must use HTTPS in production.");
}
