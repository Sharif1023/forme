import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { query, withTransaction } from "./db/pool.mjs";
import { audit, jsonValue } from "./audit.mjs";
import { requireAdmin, requireCsrf, requireOrigin, requireRoles } from "./auth.mjs";
import { ApiError, conflict, invalid, notFound, send, wrap } from "./errors.mjs";
import {
  getCatalog,
  saveProduct,
  archiveProduct,
  updateInventory,
  variantDto,
} from "./catalog.mjs";
import { getOrder, markOrderPaid, orderDto, updateOrderStatus, addOrderEvent } from "./orders.mjs";
import { approveManualPayment } from "./payment-routes.mjs";
import { maskedSettings, updateSettings } from "./settings.mjs";
import { hashPassword } from "./security.mjs";
import { config } from "./config.mjs";

const manage = requireRoles("owner", "admin", "manager"),
  finance = requireRoles("owner", "admin"),
  owner = requireRoles("owner");
const pageQuery = (raw) =>
  z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      search: z.string().trim().max(180).default(""),
    })
    .parse(raw);
const couponDto = (row) => ({
  id: row.id,
  code: row.code,
  type: row.type,
  value: Number(row.value),
  minSubtotalPaise: Number(row.min_subtotal_paise),
  maxDiscountPaise: row.max_discount_paise === null ? null : Number(row.max_discount_paise),
  usageLimit: row.usage_limit,
  usedCount: row.used_count,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  active: !!row.active,
});
const optionalDate = z
  .union([z.string().datetime({ offset: true }), z.literal("")])
  .nullable()
  .optional();
const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .transform((value) => value.toUpperCase()),
    type: z.enum(["percent", "fixed"]),
    value: z.number().int().min(1).max(1000000000),
    minSubtotalPaise: z.number().int().min(0).max(1000000000).default(0),
    maxDiscountPaise: z.number().int().min(0).max(1000000000).nullable().optional(),
    usageLimit: z.number().int().min(1).max(10000000).nullable().optional(),
    startsAt: optionalDate,
    endsAt: optionalDate,
    active: z.boolean().default(true),
  })
  .refine(
    (value) => value.type !== "percent" || value.value <= 100,
    "Percentage discounts cannot exceed100.",
  );

export function adminRouter() {
  const router = Router();
  router.use(requireOrigin, requireAdmin, requireCsrf);
  router.post(
    "/uploads",
    manage,
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
    wrap(async (req, res) => {
      const buffer = req.body;
      if (!Buffer.isBuffer(buffer) || buffer.length < 12)
        throw invalid("Choose a PNG, JPEG or WebP image.");
      const mime = req.get("content-type")?.split(";")[0].trim().toLowerCase();
      let extension;
      if (
        mime === "image/png" &&
        buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        extension = "png";
      else if (mime === "image/jpeg" && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
        extension = "jpg";
      else if (
        mime === "image/webp" &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
      )
        extension = "webp";
      if (!extension)
        throw invalid("The image contents do not match the selected PNG, JPEG or WebP format.");
      const name = `${randomUUID()}.${extension}`;
      await mkdir(config.uploadDir, { recursive: true });
      await writeFile(path.join(config.uploadDir, name), buffer, { flag: "wx" });
      await audit(req.admin, "image.uploaded", "upload", name, { mime, bytes: buffer.length });
      send(res, { url: `/uploads/${name}` }, 201);
    }),
  );
  router.get(
    "/dashboard",
    wrap(async (_req, res) => {
      const summary = (
        await query(
          "SELECT COUNT(*) AS orders,COALESCE(SUM(CASE WHEN payment_status='paid' AND status<>'cancelled' THEN total_paise ELSE 0 END),0) AS total_revenue,COALESCE(SUM(status='pending'),0) AS pending_orders FROM orders",
        )
      )[0];
      const inventory = (
        await query(
          "SELECT COUNT(*) AS low_stock FROM variants WHERE active=1 AND stock-reserved<=5",
        )
      )[0];
      const customers = (await query("SELECT COUNT(*) AS customers FROM customers"))[0];
      const recent = await query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 8");
      send(res, {
        orders: Number(summary.orders),
        totalRevenuePaise: Number(summary.total_revenue),
        pendingOrders: Number(summary.pending_orders),
        lowStockCount: Number(inventory.low_stock),
        customers: Number(customers.customers),
        recentOrders: recent.map(orderDto),
      });
    }),
  );
  router.get(
    "/products",
    wrap(async (_req, res) => send(res, await getCatalog({ admin: true }))),
  );
  router.post(
    "/products",
    manage,
    wrap(async (req, res) => send(res, await saveProduct(req.body, null, req.admin), 201)),
  );
  router.patch(
    "/products/:id",
    manage,
    wrap(async (req, res) => send(res, await saveProduct(req.body, req.params.id, req.admin))),
  );
  router.delete(
    "/products/:id",
    manage,
    wrap(async (req, res) => send(res, await archiveProduct(req.params.id, req.admin))),
  );
  router.get(
    "/inventory",
    wrap(async (req, res) => {
      const { search } = pageQuery(req.query);
      const rows = await query(
        "SELECT v.*,p.name AS product_name FROM variants v JOIN products p ON p.id=v.product_id WHERE (?='' OR p.name LIKE ? OR v.sku LIKE ? OR v.color_name LIKE ?) ORDER BY v.product_id,v.color_id,v.size",
        [search, `%${search}%`, `%${search}%`, `%${search}%`],
      );
      send(res, { variants: rows.map(variantDto) });
    }),
  );
  router.patch(
    "/inventory/:id",
    manage,
    wrap(async (req, res) => send(res, await updateInventory(req.params.id, req.body, req.admin))),
  );
  router.get(
    "/orders",
    wrap(async (req, res) => {
      const { page, limit, search } = pageQuery(req.query),
        status = typeof req.query.status === "string" ? req.query.status : "";
      const parameters = [search, `%${search}%`, `%${search}%`, status, status];
      const filter = "(?='' OR o.order_number LIKE ? OR c.phone LIKE ?) AND (?='' OR o.status=?)";
      const rows = await query(
        `SELECT o.* FROM orders o JOIN customers c ON c.id=o.customer_id WHERE ${filter} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
        [...parameters, limit, (page - 1) * limit],
      );
      const count = (
        await query(
          `SELECT COUNT(*) AS total FROM orders o JOIN customers c ON c.id=o.customer_id WHERE ${filter}`,
          parameters,
        )
      )[0];
      send(res, { orders: rows.map(orderDto), page, total: Number(count.total) });
    }),
  );
  router.get(
    "/orders/:id",
    wrap(async (req, res) => send(res, { order: await getOrder(req.params.id, { admin: true }) })),
  );
  router.patch(
    "/orders/:id/status",
    manage,
    wrap(async (req, res) =>
      send(res, await updateOrderStatus(req.params.id, req.body, req.admin)),
    ),
  );
  router.post(
    "/orders/:id/approve-payment",
    finance,
    wrap(async (req, res) =>
      send(res, await approveManualPayment(req.params.id, req.body, req.admin)),
    ),
  );
  router.post(
    "/orders/:id/review-payment",
    finance,
    wrap(async (req, res) => {
      const input = z
        .object({
          paymentId: z.string().uuid(),
          decision: z.enum(["approve", "reject"]),
          note: z.string().trim().min(3).max(2000),
        })
        .parse(req.body);
      await withTransaction(async (connection) => {
        const order = (
          await query("SELECT * FROM orders WHERE id=? FOR UPDATE", [req.params.id], connection)
        )[0];
        if (!order) throw notFound();
        const payment = (
          await query(
            "SELECT * FROM payments WHERE id=? AND order_id=? FOR UPDATE",
            [input.paymentId, order.id],
            connection,
          )
        )[0];
        if (!payment || payment.status !== "pending_review")
          throw conflict("That payment is not awaiting review.");
        if (input.decision === "approve") {
          if (order.status === "cancelled" || order.reservation_status === "released")
            throw conflict("This cancelled reservation requires a refund or a new order.");
          const verified = jsonValue(payment.verified_payload, {});
          if (
            payment.provider === "sslcommerz" &&
            (!verified.validationId || !verified.transactionId)
          )
            throw conflict("The gateway payment has not been independently verified.");
          const transactionId =
            payment.transaction_id?.slice(payment.provider.length + 1) || payment.reference;
          await markOrderPaid(
            {
              orderId: order.id,
              provider: payment.provider,
              transactionId,
              amountPaise: Number(payment.amount_paise),
              providerReference: payment.reference,
              verifiedPayload: verified,
              actor: req.admin,
            },
            connection,
          );
        } else {
          if (payment.provider === "sslcommerz")
            throw conflict(
              "A verified gateway charge must remain under review until its refund or reconciliation is recorded.",
            );
          await query("UPDATE payments SET status='rejected' WHERE id=?", [payment.id], connection);
          await query(
            "UPDATE orders SET payment_status='unpaid',reservation_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 MINUTE) WHERE id=?",
            [order.id],
            connection,
          );
        }
        await addOrderEvent(connection, order.id, "payment_reviewed", input.note, req.admin.id);
        await audit(
          req.admin,
          "payment.reviewed",
          "payment",
          payment.id,
          { decision: input.decision },
          connection,
        );
      });
      send(res, { order: await getOrder(req.params.id, { admin: true }) });
    }),
  );
  router.get(
    "/customers",
    wrap(async (req, res) => {
      const { page, limit, search } = pageQuery(req.query);
      const rows = await query(
        "SELECT c.*,COUNT(o.id) AS order_count,COALESCE(SUM(CASE WHEN o.payment_status='paid' AND o.status<>'cancelled' THEN o.total_paise ELSE 0 END),0) AS total_spent FROM customers c LEFT JOIN orders o ON o.customer_id=c.id WHERE (?='' OR c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?) GROUP BY c.id ORDER BY c.created_at DESC LIMIT ? OFFSET ?",
        [search, `%${search}%`, `%${search}%`, `%${search}%`, limit, (page - 1) * limit],
      );
      send(res, {
        customers: rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          orderCount: Number(row.order_count),
          totalSpentPaise: Number(row.total_spent),
          createdAt: row.created_at,
        })),
        page,
      });
    }),
  );
  router.get(
    "/coupons",
    wrap(async (_req, res) =>
      send(res, {
        coupons: (await query("SELECT * FROM coupons ORDER BY created_at DESC")).map(couponDto),
      }),
    ),
  );
  const saveCoupon = wrap(async (req, res) => {
    const prior = req.params.id
      ? (await query("SELECT * FROM coupons WHERE id=?", [req.params.id]))[0]
      : null;
    if (req.params.id && !prior) throw notFound();
    const data = couponSchema.parse(
      prior
        ? {
            ...couponDto(prior),
            startsAt: prior.starts_at ? new Date(prior.starts_at).toISOString() : null,
            endsAt: prior.ends_at ? new Date(prior.ends_at).toISOString() : null,
            ...req.body,
          }
        : req.body,
    );
    if (data.startsAt && data.endsAt && new Date(data.endsAt) <= new Date(data.startsAt))
      throw invalid("Coupon expiry must follow its start date.");
    const id = prior?.id || randomUUID();
    const values = [
      data.code,
      data.type,
      data.value,
      data.minSubtotalPaise,
      data.maxDiscountPaise ?? null,
      data.usageLimit ?? null,
      data.startsAt ? new Date(data.startsAt) : null,
      data.endsAt ? new Date(data.endsAt) : null,
      data.active ? 1 : 0,
    ];
    await withTransaction(async (connection) => {
      if (prior)
        await query(
          "UPDATE coupons SET code=?,type=?,value=?,min_subtotal_paise=?,max_discount_paise=?,usage_limit=?,starts_at=?,ends_at=?,active=? WHERE id=?",
          [...values, id],
          connection,
        );
      else
        await query(
          "INSERT INTO coupons (code,type,value,min_subtotal_paise,max_discount_paise,usage_limit,starts_at,ends_at,active,id) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [...values, id],
          connection,
        );
      await audit(
        req.admin,
        prior ? "coupon.updated" : "coupon.created",
        "coupon",
        id,
        { code: data.code },
        connection,
      );
    });
    send(
      res,
      { coupon: couponDto((await query("SELECT * FROM coupons WHERE id=?", [id]))[0]) },
      prior ? 200 : 201,
    );
  });
  router.post("/coupons", manage, saveCoupon);
  router.patch("/coupons/:id", manage, saveCoupon);
  router.delete(
    "/coupons/:id",
    manage,
    wrap(async (req, res) => {
      await query("UPDATE coupons SET active=0 WHERE id=?", [req.params.id]);
      await audit(req.admin, "coupon.disabled", "coupon", req.params.id);
      send(res, { disabled: true });
    }),
  );
  router.get(
    "/settings",
    wrap(async (_req, res) => send(res, await maskedSettings())),
  );
  router.patch(
    "/settings",
    manage,
    wrap(async (req, res) => send(res, await updateSettings(req.body, req.admin))),
  );
  router.get(
    "/staff",
    owner,
    wrap(async (_req, res) =>
      send(res, {
        staff: (
          await query(
            "SELECT id,name,email,role,active,created_at FROM admin_users ORDER BY created_at",
          )
        ).map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          active: !!row.active,
          createdAt: row.created_at,
        })),
      }),
    ),
  );
  router.post(
    "/staff",
    owner,
    wrap(async (req, res) => {
      const data = z
        .object({
          name: z.string().trim().min(2).max(180),
          email: z.string().trim().email().max(254),
          password: z.string().min(12).max(200),
          role: z.enum(["owner", "admin", "manager", "support"]),
        })
        .parse(req.body);
      const id = randomUUID();
      await withTransaction(async (connection) => {
        await query(
          "INSERT INTO admin_users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
          [id, data.name, data.email.toLowerCase(), await hashPassword(data.password), data.role],
          connection,
        );
        await audit(
          req.admin,
          "staff.created",
          "admin",
          id,
          { name: data.name, email: data.email, role: data.role },
          connection,
        );
      });
      send(
        res,
        {
          staff: {
            id,
            name: data.name,
            email: data.email.toLowerCase(),
            role: data.role,
            active: true,
          },
        },
        201,
      );
    }),
  );
  router.patch(
    "/staff/:id",
    owner,
    wrap(async (req, res) => {
      const data = z
        .object({
          name: z.string().trim().min(2).max(180).optional(),
          email: z.string().trim().email().max(254).optional(),
          password: z.string().min(12).max(200).optional(),
          role: z.enum(["owner", "admin", "manager", "support"]).optional(),
          active: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);
      await withTransaction(async (connection) => {
        const staff = (
          await query(
            "SELECT * FROM admin_users WHERE id=? FOR UPDATE",
            [req.params.id],
            connection,
          )
        )[0];
        if (!staff) throw notFound();
        if (
          staff.id === req.admin.id &&
          (data.active === false || (data.role && data.role !== "owner"))
        )
          throw invalid("You cannot remove your own owner access.");
        if (
          staff.role === "owner" &&
          (data.active === false || (data.role && data.role !== "owner"))
        ) {
          const owners = await query(
            "SELECT id FROM admin_users WHERE role='owner' AND active=1 FOR UPDATE",
            [],
            connection,
          );
          if (owners.length <= 1) throw conflict("The shop must retain an active owner.");
        }
        await query(
          "UPDATE admin_users SET name=?,email=?,password_hash=?,role=?,active=? WHERE id=?",
          [
            data.name ?? staff.name,
            data.email?.toLowerCase() ?? staff.email,
            data.password ? await hashPassword(data.password) : staff.password_hash,
            data.role ?? staff.role,
            data.active === undefined ? staff.active : data.active ? 1 : 0,
            staff.id,
          ],
          connection,
        );
        if (data.password || data.active === false || data.role)
          await query("DELETE FROM sessions WHERE admin_id=?", [staff.id], connection);
        await audit(
          req.admin,
          "staff.updated",
          "admin",
          staff.id,
          {
            fields: Object.keys(data).filter((key) => key !== "password"),
            passwordChanged: !!data.password,
          },
          connection,
        );
      });
      send(res, { updated: true });
    }),
  );
  router.get(
    "/audit",
    finance,
    wrap(async (req, res) => {
      const { page, limit } = pageQuery(req.query);
      const rows = await query(
        "SELECT l.*,a.name AS actor_name FROM audit_logs l LEFT JOIN admin_users a ON a.id=l.actor_id ORDER BY l.created_at DESC LIMIT ? OFFSET ?",
        [limit, (page - 1) * limit],
      );
      send(res, {
        logs: rows.map((row) => ({
          id: row.id,
          actorId: row.actor_id,
          actorName: row.actor_name,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          metadata: jsonValue(row.metadata_json, {}),
          ipAddress: row.ip_address,
          createdAt: row.created_at,
        })),
        page,
      });
    }),
  );
  return router;
}
