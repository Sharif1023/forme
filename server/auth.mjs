import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.mjs";
import { query } from "./db/pool.mjs";
import { audit } from "./audit.mjs";
import { ApiError, send, wrap } from "./errors.mjs";
import {
  csrfForSession,
  equalSecret,
  hashPassword,
  hashToken,
  randomToken,
  verifyPassword,
} from "./security.mjs";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_ATTEMPTS",
      message: "Too many sign-in attempts. Please try again later.",
    },
  },
});
const cookieOptions = {
  httpOnly: true,
  secure: config.production,
  sameSite: "lax",
  path: "/api/admin",
  maxAge: config.sessionHours * 60 * 60 * 1000,
};
const publicAdmin = (admin) => ({
  id: admin.id,
  name: admin.name,
  email: admin.email,
  role: admin.role,
  active: !!admin.active,
});

export function requireOrigin(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  const referer = req.get("referer");
  let supplied = origin;
  if (!supplied && referer) {
    try {
      supplied = new URL(referer).origin;
    } catch {
      supplied = "invalid";
    }
  }
  const sameHost = `${req.protocol}://${req.get("host")}`;
  if (supplied && !config.allowedOrigins.includes(supplied) && supplied !== sameHost)
    return next(new ApiError(403, "INVALID_ORIGIN", "This request did not come from the shop."));
  if (!supplied && config.production)
    return next(new ApiError(403, "ORIGIN_REQUIRED", "An origin header is required."));
  next();
}

export const requireAdmin = wrap(async (req, _res, next) => {
  const token = req.cookies?.[config.cookieName];
  if (!token || typeof token !== "string" || token.length > 200)
    throw new ApiError(401, "AUTH_REQUIRED", "Please sign in to the admin panel.");
  const rows = await query(
    "SELECT a.id,a.name,a.email,a.role,a.active FROM sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3) AND a.active=1 LIMIT 1",
    [hashToken(token)],
  );
  if (!rows.length) throw new ApiError(401, "SESSION_EXPIRED", "Please sign in again.");
  req.admin = { ...publicAdmin(rows[0]), ip: req.ip };
  req.sessionToken = token;
  next();
});
export function requireCsrf(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!equalSecret(req.get("x-csrf-token"), csrfForSession(req.sessionToken)))
    return next(
      new ApiError(403, "CSRF_INVALID", "Your session needs refreshing. Please sign in again."),
    );
  next();
}
export const requireRoles =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.admin.role)
      ? next()
      : next(new ApiError(403, "FORBIDDEN", "Your account cannot perform this action."));

export function authRouter() {
  const router = Router();
  router.post(
    "/login",
    requireOrigin,
    loginLimiter,
    wrap(async (req, res) => {
      const { email, password } = z
        .object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) })
        .parse(req.body);
      const rows = await query("SELECT * FROM admin_users WHERE email=? AND active=1 LIMIT 1", [
        email.toLowerCase(),
      ]);
      const admin = rows[0];
      // The dummy hash keeps unknown-user requests on the same expensive path.
      const valid = await verifyPassword(
        password,
        admin?.password_hash || "scrypt$32768$00000000000000000000000000000000$" + "0".repeat(128),
      );
      if (!admin || !valid)
        throw new ApiError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.");
      const token = randomToken();
      await query("INSERT INTO sessions (token_hash,admin_id,expires_at) VALUES (?,?,?)", [
        hashToken(token),
        admin.id,
        new Date(Date.now() + cookieOptions.maxAge),
      ]);
      await audit({ ...admin, ip: req.ip }, "auth.login", "admin", admin.id);
      res.cookie(config.cookieName, token, cookieOptions);
      send(res, { admin: publicAdmin(admin), csrfToken: csrfForSession(token) });
    }),
  );
  router.get("/me", requireAdmin, (req, res) =>
    send(res, { admin: publicAdmin(req.admin), csrfToken: csrfForSession(req.sessionToken) }),
  );
  router.post(
    "/logout",
    requireOrigin,
    requireAdmin,
    requireCsrf,
    wrap(async (req, res) => {
      await query("DELETE FROM sessions WHERE token_hash=?", [hashToken(req.sessionToken)]);
      res.clearCookie(config.cookieName, { ...cookieOptions, maxAge: undefined });
      send(res, { loggedOut: true });
    }),
  );
  return router;
}
