import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { query, withTransaction } from "./db/pool.mjs";
import { config } from "./config.mjs";
import { audit, jsonValue } from "./audit.mjs";
import { ApiError, conflict, invalid, notFound, send, wrap } from "./errors.mjs";
import { authoriseOrder, getOrder, addOrderEvent, markOrderPaid } from "./orders.mjs";
import { getPaymentConfig } from "./settings.mjs";
import { createSession, validatePayment, assessVerifiedPayment } from "./payments/sslcommerz.mjs";
import { createManualPaymentSubmission, normalizeTransactionId } from "./payments/manual.mjs";

export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_ATTEMPTS",
      message: "Too many payment requests. Please wait and try again.",
    },
  },
});
const tokenBody = z.object({ lookupToken: z.string().min(20).max(200) });

export async function submitPaymentProof(id, raw) {
  const data = z
    .object({
      lookupToken: z.string().min(20).max(200),
      reference: z.string().min(1).max(120),
      senderPhone: z.string().max(32).optional(),
    })
    .parse(raw);
  const order = await authoriseOrder(id, data.lookupToken);
  const method = await getPaymentConfig(order.payment_method);
  if (
    !method.enabled ||
    order.payment_method === "cod" ||
    (["bkash", "nagad"].includes(order.payment_method) && method.mode !== "manual")
  )
    throw invalid("This order does not accept a manual payment reference.");
  const proof = createManualPaymentSubmission({
    method: order.payment_method,
    transactionId: data.reference,
    senderPhone: data.senderPhone,
    expectedTotalMinor: Number(order.total_paise),
  });
  await withTransaction(async (connection) => {
    const locked = (await query("SELECT * FROM orders WHERE id=? FOR UPDATE", [id], connection))[0];
    if (locked.status === "cancelled" || locked.payment_status === "paid")
      throw conflict("This order cannot accept another payment reference.");
    const transactionId = `${order.payment_method}:${proof.transactionId}`;
    const prior = (
      await query("SELECT * FROM payments WHERE transaction_id=?", [transactionId], connection)
    )[0];
    if (prior) {
      if (prior.order_id === id) return;
      throw conflict("That payment reference has already been submitted for another order.");
    }
    await query(
      "INSERT INTO payments (id,order_id,provider,method,status,amount_paise,transaction_id,reference,sender_phone) VALUES (?,?,?,?, 'pending_review',?,?,?,?)",
      [
        randomUUID(),
        id,
        order.payment_method,
        order.payment_method,
        Number(order.total_paise),
        transactionId,
        proof.reference,
        proof.senderPhone,
      ],
      connection,
    );
    await query(
      "UPDATE orders SET payment_status='pending_review',reservation_expires_at=NULL WHERE id=?",
      [id],
      connection,
    );
    await addOrderEvent(
      connection,
      id,
      "payment_review",
      "Payment reference submitted for review.",
    );
  });
  return { order: await getOrder(id) };
}

export async function approveManualPayment(id, raw, actor) {
  const data = z
    .object({ reference: z.string().min(1).max(120), note: z.string().max(2000).optional() })
    .parse(raw);
  const reference = normalizeTransactionId(data.reference);
  await withTransaction(async (connection) => {
    const order = (await query("SELECT * FROM orders WHERE id=? FOR UPDATE", [id], connection))[0];
    if (!order) throw notFound();
    if (order.status === "cancelled")
      throw conflict("A cancelled order cannot be approved for fulfillment.");
    const proof = (
      await query(
        "SELECT * FROM payments WHERE order_id=? AND reference=? AND status IN ('pending_review','paid') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [id, reference],
        connection,
      )
    )[0];
    if (!proof) throw invalid("Choose a submitted payment reference for review.");
    if (proof.provider === "sslcommerz")
      throw invalid("Gateway reviews use the gateway review action.");
    await markOrderPaid(
      {
        orderId: id,
        provider: proof.provider,
        transactionId: reference,
        amountPaise: Number(proof.amount_paise),
        providerReference: reference,
        actor,
      },
      connection,
    );
    if (data.note) await addOrderEvent(connection, id, "payment_note", data.note, actor.id);
  });
  return { order: await getOrder(id, { admin: true }) };
}

export async function beginGatewayPayment(id, raw) {
  const { lookupToken } = tokenBody.parse(raw);
  await authoriseOrder(id, lookupToken);
  const order = await getOrder(id, { admin: true });
  const method = await getPaymentConfig(order.paymentMethod);
  if (
    !["bkash", "nagad"].includes(order.paymentMethod) ||
    !method.enabled ||
    method.mode !== "gateway"
  )
    throw invalid("Choose an enabled online payment method for this order.");
  const gateway = await getPaymentConfig("sslcommerz", { includeSecrets: true });
  const attempt = await withTransaction(async (connection) => {
    const locked = (await query("SELECT * FROM orders WHERE id=? FOR UPDATE", [id], connection))[0];
    if (locked.status === "cancelled" || locked.reservation_status !== "reserved")
      throw conflict("The order reservation is no longer available for payment.");
    if (locked.payment_status === "paid") throw conflict("This order has already been paid.");
    const prior = (
      await query(
        "SELECT * FROM payments WHERE order_id=? AND provider='sslcommerz' AND status IN ('initiating','pending') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [id],
        connection,
      )
    )[0];
    if (prior?.gateway_session_id) {
      const saved = jsonValue(prior.verified_payload, {});
      if (saved.redirectUrl) return { redirectUrl: saved.redirectUrl, reused: true };
    }
    if (prior && Date.now() - new Date(prior.created_at).getTime() < 60000)
      throw conflict("Online checkout is being prepared. Please try again in a moment.");
    if (prior)
      await query("UPDATE payments SET status='failed' WHERE id=?", [prior.id], connection);
    const paymentId = randomUUID(),
      transactionId = `F${randomBytes(14).toString("hex")}`;
    await query(
      "INSERT INTO payments (id,order_id,provider,method,status,amount_paise,gateway_transaction_id) VALUES (?,?, 'sslcommerz',?,'initiating',?,?)",
      [paymentId, id, order.paymentMethod, order.totalPaise, transactionId],
      connection,
    );
    await query(
      "UPDATE orders SET gateway_transaction_id=?,payment_status='pending' WHERE id=?",
      [transactionId, id],
      connection,
    );
    return { paymentId, transactionId };
  });
  if (attempt.redirectUrl) return { redirectUrl: attempt.redirectUrl };
  try {
    const session = await createSession({
      order: { ...order, gatewayTransactionId: attempt.transactionId },
      totalMinor: order.totalPaise,
      currency: "BDT",
      customer: { ...order.customer, ...order.shipping },
      items: order.items,
      method: order.paymentMethod,
      config: gateway,
      callbackBase: `${config.publicBaseUrl}/api/payments/sslcommerz`,
    });
    await query(
      "UPDATE payments SET status='pending',gateway_session_id=?,verified_payload=? WHERE id=? AND status='initiating'",
      [
        session.sessionKey,
        JSON.stringify({ redirectUrl: session.redirectUrl, environment: session.environment }),
        attempt.paymentId,
      ],
    );
    return { redirectUrl: session.redirectUrl };
  } catch (error) {
    await query("UPDATE payments SET status='failed' WHERE id=? AND status='initiating'", [
      attempt.paymentId,
    ]);
    await query(
      "UPDATE orders SET payment_status='failed' WHERE id=? AND payment_status='pending'",
      [id],
    );
    throw error;
  }
}

export function gatewayCallbackRouter() {
  const router = Router();
  router.all(
    "/:outcome",
    paymentLimiter,
    wrap(async (req, res) => {
      const outcome = req.params.outcome;
      if (!["success", "fail", "cancel", "ipn"].includes(outcome)) throw notFound();
      const payload = { ...req.query, ...req.body };
      const transactionId = typeof payload.tran_id === "string" ? payload.tran_id.slice(0, 30) : "";
      const payment = (
        await query(
          "SELECT * FROM payments WHERE gateway_transaction_id=? AND provider='sslcommerz'",
          [transactionId],
        )
      )[0];
      if (!payment) throw notFound("That payment attempt was not found.");
      let result = { review: false };
      if (outcome === "success" || outcome === "ipn") {
        const valId = z.string().min(1).max(255).parse(payload.val_id);
        const gateway = await getPaymentConfig("sslcommerz", { includeSecrets: true });
        const verified = await validatePayment(valId, gateway);
        const assessment = assessVerifiedPayment(verified, {
          transactionId: payment.gateway_transaction_id,
          totalMinor: Number(payment.amount_paise),
          currency: "BDT",
          sessionKey: payment.gateway_session_id,
        });
        result = await markOrderPaid({
          orderId: payment.order_id,
          provider: "sslcommerz",
          transactionId: assessment.bankTransactionId || assessment.transactionId,
          amountPaise: assessment.totalMinor,
          providerReference: assessment.validationId,
          verifiedPayload: {
            transactionId: assessment.transactionId,
            bankTransactionId: assessment.bankTransactionId,
            validationId: assessment.validationId,
            riskReview: assessment.requiresReview,
            environment: assessment.environment,
          },
          review: assessment.requiresReview,
        });
      }
      // Unverified fail/cancel redirects cannot change a financial state. Only a
      // server-validated response settles a payment; unpaid reservations expire.
      if (outcome === "ipn")
        return send(res, {
          received: true,
          paymentStatus: result.review ? "pending_review" : "paid",
        });
      const state = outcome === "success" ? (result.review ? "review" : "paid") : outcome;
      res.redirect(
        303,
        `${config.frontendBaseUrl}/orders/${encodeURIComponent(payment.order_id)}?payment=${state}`,
      );
    }),
  );
  return router;
}
