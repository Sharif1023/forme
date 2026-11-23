import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.mjs";
import { query } from "./db/pool.mjs";
import { ApiError, errorHandler, send, wrap } from "./errors.mjs";
import { authRouter, requireOrigin } from "./auth.mjs";
import { adminRouter } from "./admin-routes.mjs";
import { getCatalog } from "./catalog.mjs";
import { publicSettings } from "./settings.mjs";
import { requestTryOnPreview, getTryOnJob } from "./tryon.mjs";
import { createOrder, getOrder, authoriseOrder, lookupOrder, quoteCart } from "./orders.mjs";
import {
  beginGatewayPayment,
  gatewayCallbackRouter,
  paymentLimiter,
  submitPaymentProof,
} from "./payment-routes.mjs";

const limiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: { code: "TOO_MANY_REQUESTS", message: "Please wait a moment before trying again." },
    },
  });

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: config.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              fontSrc: ["'self'", "https://fonts.gstatic.com"],
              imgSrc: ["'self'", "data:", "blob:", "https:"],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
    }),
  );
  const browserCors = cors({
    origin: (origin, done) =>
      !origin || config.allowedOrigins.includes(origin)
        ? done(null, true)
        : done(new ApiError(403, "INVALID_ORIGIN", "That origin is not allowed.")),
    credentials: true,
  });
  app.use((req, res, next) =>
    req.path.startsWith("/api/payments/sslcommerz/") ? next() : browserCors(req, res, next),
  );
  app.use(express.json({ limit: "128kb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  app.use(cookieParser());
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get(
    "/api/health",
    wrap(async (_req, res) => {
      await query("SELECT 1 AS ready");
      send(res, { status: "ok", database: "mysql", currency: "BDT" });
    }),
  );
  // Provider callbacks are verified server-to-server and intentionally precede
  // browser Origin/CSRF checks. No callback body can mark an order paid itself.
  app.use("/api/payments/sslcommerz", gatewayCallbackRouter());
  app.use("/api", requireOrigin);
  app.post(
    "/api/try-on/preview",
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "PREVIEW_RATE_LIMIT",
          message: "Please wait a moment before requesting another preview.",
        },
      },
    }),
    wrap(async (req, res) => send(res, await requestTryOnPreview(req.body))),
  );
  app.get(
    "/api/try-on/jobs/:id",
    rateLimit({
      windowMs: 60_000,
      limit: 240,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "PREVIEW_RATE_LIMIT",
          message: "Please wait a moment before checking this preview again.",
        },
      },
    }),
    wrap(async (req, res) => send(res, await getTryOnJob(req.params.id))),
  );
  app.get(
    "/api/catalog",
    wrap(async (_req, res) => send(res, await getCatalog())),
  );
  app.get(
    "/api/store/settings",
    wrap(async (_req, res) => send(res, await publicSettings())),
  );
  app.post(
    "/api/checkout/quote",
    limiter(120),
    wrap(async (req, res) => {
      const { coupon, ...quote } = await quoteCart(req.body);
      send(res, quote);
    }),
  );
  app.post(
    "/api/orders",
    limiter(15),
    wrap(async (req, res) => {
      const result = await createOrder({
        ...req.body,
        idempotencyKey: req.body?.idempotencyKey || req.get("Idempotency-Key"),
      });
      send(res, result, result.replayed ? 200 : 201);
    }),
  );
  app.post(
    "/api/orders/lookup",
    limiter(15),
    wrap(async (req, res) => send(res, await lookupOrder(req.body))),
  );
  app.get(
    "/api/orders/:id",
    limiter(30),
    wrap(async (req, res) => {
      await authoriseOrder(req.params.id, req.query.lookupToken);
      send(res, { order: await getOrder(req.params.id) });
    }),
  );
  app.post(
    "/api/orders/:id/payment-proof",
    paymentLimiter,
    wrap(async (req, res) => send(res, await submitPaymentProof(req.params.id, req.body))),
  );
  app.post(
    "/api/orders/:id/pay",
    paymentLimiter,
    wrap(async (req, res) => send(res, await beginGatewayPayment(req.params.id, req.body))),
  );
  app.use("/api/admin/auth", authRouter());
  app.use("/api/admin", adminRouter());
  app.use("/api", (_req, _res, next) =>
    next(new ApiError(404, "NOT_FOUND", "That API endpoint was not found.")),
  );
  app.use(
    "/uploads",
    express.static(config.uploadDir, {
      dotfiles: "deny",
      index: false,
      maxAge: "1y",
      immutable: true,
      setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
    }),
  );
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
  if (existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist, { index: false, maxAge: config.production ? "1h" : 0 }));
    app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
  }
  app.use(errorHandler);
  return app;
}
export default createApp;
