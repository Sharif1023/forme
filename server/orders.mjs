import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { query, withTransaction } from "./db/pool.mjs";
import { audit, jsonValue } from "./audit.mjs";
import { config } from "./config.mjs";
import { ApiError, conflict, invalid, notFound } from "./errors.mjs";
import { hashToken, equalSecret } from "./security.mjs";
import { getSettings, publicSettings } from "./settings.mjs";
import { validateCheckoutEligibility } from "./payments/sslcommerz.mjs";

const phoneSchema = z
  .string()
  .trim()
  .max(32)
  .transform((value) => value.replace(/[ ()-]/g, ""))
  .refine(
    (value) => /^(?:\+?88)?01[3-9]\d{8}$/.test(value),
    "Enter a valid Bangladeshi mobile number.",
  )
  .transform((value) => `+88${value.replace(/^(?:\+?88)/, "")}`);
const itemSchema = z
  .object({
    variantId: z.string().min(1).max(180).optional(),
    productId: z.string().min(1).max(128).optional(),
    colorId: z.string().min(1).max(80).optional(),
    size: z.string().min(1).max(30).optional(),
    quantity: z.number().int().min(1).max(20),
  })
  .refine(
    (item) => !!item.variantId || !!(item.productId && item.colorId && item.size),
    "Choose a valid product, colour and size.",
  );
const quoteSchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
  couponCode: z.string().trim().max(40).optional(),
  shipping: z.object({ city: z.string().trim().max(120).optional() }).optional(),
  city: z.string().trim().max(120).optional(),
});
const orderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(180),
    phone: phoneSchema,
    email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  }),
  shipping: z.object({
    address: z.string().trim().min(5).max(1000),
    city: z.string().trim().min(2).max(120),
    postalCode: z.string().trim().max(20).optional(),
  }),
  items: z.array(itemSchema).min(1).max(50),
  paymentMethod: z.enum(["cod", "bkash", "nagad", "bank"]),
  couponCode: z.string().trim().max(40).optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
});

const normaliseItems = (input) =>
  Array.isArray(input)
    ? input.map((item) => ({ ...item, quantity: item.quantity ?? item.qty }))
    : input;
const lookupTokenFor = (id, key) =>
  createHmac("sha256", config.sessionSecret).update(`${id}\0${key}`).digest("base64url");

export async function quoteCart(raw, { connection, lock = false } = {}) {
  raw = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const data = quoteSchema.parse({ ...raw, items: normaliseItems(raw.items) });
  const selected = new Map();
  for (const item of data.items) {
    const rows = await query(
      `SELECT v.id FROM variants v WHERE ${item.variantId ? "v.id=?" : "v.product_id=? AND v.color_id=? AND v.size=?"}`,
      item.variantId ? [item.variantId] : [item.productId, item.colorId, item.size],
      connection,
    );
    if (!rows.length) throw invalid("A selected product, colour or size is no longer available.");
    const id = rows[0].id;
    const quantity = (selected.get(id) || 0) + item.quantity;
    if (quantity > 20) throw invalid("Choose no more than 20 of the same variant.");
    selected.set(id, quantity);
  }
  const items = [];
  for (const [id, quantity] of [...selected.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const rows = await query(
      `SELECT v.*,p.name,p.active AS product_active,p.studio_supported,p.image_url FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=?${lock ? " FOR UPDATE" : ""}`,
      [id],
      connection,
    );
    const variant = rows[0];
    if (!variant || !variant.active || !variant.product_active)
      throw conflict("A selected item is no longer available.");
    const available = Number(variant.stock) - Number(variant.reserved);
    if (quantity > available)
      throw new ApiError(
        409,
        "OUT_OF_STOCK",
        `${variant.name} in ${variant.color_name}, size ${variant.size}, has ${available} available.`,
        { variantId: id, available },
      );
    items.push({
      variantId: id,
      productId: variant.product_id,
      name: variant.name,
      productName: variant.name,
      colorId: variant.color_id,
      colorName: variant.color_name,
      size: variant.size,
      sku: variant.sku,
      quantity,
      unitPricePaise: Number(variant.price_paise),
      totalPaise: Number(variant.price_paise) * quantity,
      imageUrl: variant.studio_supported
        ? `/images/products/${variant.product_id}--${variant.color_id}.webp`
        : variant.image_url || null,
    });
  }
  const subtotalPaise = items.reduce((sum, item) => sum + item.totalPaise, 0);
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise > 1000000000)
    throw invalid("This order total exceeds the shop limit.");
  let coupon = null,
    discountPaise = 0;
  const code = data.couponCode?.toUpperCase();
  if (code) {
    const rows = await query(
      `SELECT * FROM coupons WHERE code=?${lock ? " FOR UPDATE" : ""}`,
      [code],
      connection,
    );
    coupon = rows[0];
    const now = Date.now();
    if (
      !coupon ||
      !coupon.active ||
      (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) ||
      (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) ||
      (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit)
    )
      throw invalid("That coupon is unavailable or has expired.");
    if (subtotalPaise < Number(coupon.min_subtotal_paise))
      throw invalid("The order does not meet this coupon's minimum subtotal.");
    discountPaise =
      coupon.type === "percent"
        ? Math.floor((subtotalPaise * Number(coupon.value)) / 100)
        : Number(coupon.value);
    if (coupon.max_discount_paise !== null)
      discountPaise = Math.min(discountPaise, Number(coupon.max_discount_paise));
    discountPaise = Math.min(subtotalPaise, discountPaise);
  }
  const settings = await getSettings(connection),
    city = (data.shipping?.city || data.city || "").trim().toLowerCase();
  const shipping = settings.shipping;
  const baseFee = /dhaka|ঢাকা/i.test(city)
    ? (shipping.insideDhakaPaise ?? shipping.standardFeePaise)
    : (shipping.outsideDhakaPaise ?? shipping.standardFeePaise);
  const freeAbove = shipping.freeAbovePaise ?? shipping.freeShippingThresholdPaise;
  const shippingPaise = freeAbove > 0 && subtotalPaise - discountPaise >= freeAbove ? 0 : baseFee;
  return {
    items,
    subtotalPaise,
    discountPaise,
    shippingPaise,
    totalPaise: subtotalPaise - discountPaise + shippingPaise,
    currency: "BDT",
    ...(code ? { couponCode: code } : {}),
    coupon,
  };
}

export function orderDto(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    currency: row.currency,
    subtotalPaise: Number(row.subtotal_paise),
    discountPaise: Number(row.discount_paise),
    shippingPaise: Number(row.shipping_paise),
    totalPaise: Number(row.total_paise),
    couponCode: row.coupon_code || undefined,
    customer: jsonValue(row.customer_json, {}),
    shipping: jsonValue(row.shipping_json, {}),
    reservationStatus: row.reservation_status,
    gatewayTransactionId: row.gateway_transaction_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export async function getOrder(id, { connection, admin = false } = {}) {
  const row = (await query("SELECT * FROM orders WHERE id=?", [id], connection))[0];
  if (!row) throw notFound("That order was not found.");
  const items = await query(
    "SELECT * FROM order_items WHERE order_id=? ORDER BY id",
    [id],
    connection,
  );
  const events = await query(
    "SELECT id,status,note,created_at FROM order_events WHERE order_id=? ORDER BY created_at,id",
    [id],
    connection,
  );
  const payments = admin
    ? await query(
        "SELECT id,provider,method,status,amount_paise,currency,reference,sender_phone,paid_at,created_at FROM payments WHERE order_id=? ORDER BY created_at DESC",
        [id],
        connection,
      )
    : undefined;
  const result = {
    ...orderDto(row),
    items: items.map((item) => ({
      id: item.id,
      variantId: item.variant_id,
      productId: item.product_id,
      name: item.name,
      productName: item.name,
      colorId: item.color_id,
      colorName: item.color_name,
      size: item.size,
      sku: item.sku,
      quantity: item.quantity,
      unitPricePaise: Number(item.unit_price_paise),
      totalPaise: Number(item.total_paise),
      imageUrl: item.image_url || null,
    })),
    events: events.map((event) => ({
      id: event.id,
      status: event.status,
      ...(admin ? { note: event.note } : {}),
      createdAt: event.created_at,
    })),
  };
  if (admin)
    result.payments = payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      method: payment.method,
      status: payment.status,
      amountPaise: Number(payment.amount_paise),
      currency: payment.currency,
      reference: payment.reference,
      senderPhone: payment.sender_phone,
      paidAt: payment.paid_at,
      createdAt: payment.created_at,
    }));
  else {
    const settings = await publicSettings();
    result.paymentInstructions = settings.payments[row.payment_method];
    delete result.gatewayTransactionId;
  }
  return result;
}

export async function authoriseOrder(id, token, connection) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200)
    throw new ApiError(404, "ORDER_NOT_FOUND", "The order details did not match.");
  const order = (await query("SELECT * FROM orders WHERE id=?", [id], connection))[0];
  if (!order || !equalSecret(hashToken(token), order.lookup_token_hash))
    throw new ApiError(404, "ORDER_NOT_FOUND", "The order details did not match.");
  return order;
}
export async function lookupOrder(raw) {
  const data = z
    .object({
      orderId: z.string().uuid().optional(),
      orderNumber: z.string().max(32).optional(),
      phone: z.string().max(32).optional(),
      lookupToken: z.string().max(200).optional(),
    })
    .refine((value) => value.orderId || value.orderNumber, "Enter an order number.")
    .parse(raw);
  let row;
  if (data.orderId && data.lookupToken) row = await authoriseOrder(data.orderId, data.lookupToken);
  else {
    if (!data.orderNumber || !data.phone)
      throw invalid("Enter the order number and mobile number.");
    const phone = phoneSchema.parse(data.phone);
    const rows = await query(
      "SELECT o.* FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.order_number=? AND c.phone=? LIMIT 1",
      [data.orderNumber, phone],
    );
    row = rows[0];
    if (!row) throw new ApiError(404, "ORDER_NOT_FOUND", "The order details did not match.");
    if (data.lookupToken && !equalSecret(hashToken(data.lookupToken), row.lookup_token_hash))
      throw new ApiError(404, "ORDER_NOT_FOUND", "The order details did not match.");
  }
  const recovered = lookupTokenFor(row.id, row.idempotency_key);
  return {
    order: await getOrder(row.id),
    ...(equalSecret(hashToken(recovered), row.lookup_token_hash) ? { lookupToken: recovered } : {}),
  };
}

export async function createOrder(raw) {
  raw = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const data = orderSchema.parse({ ...raw, items: normaliseItems(raw.items) });
  const requestHash = hashToken(
    JSON.stringify({
      ...data,
      idempotencyKey: undefined,
      items: [...data.items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    }),
  );
  const existing = (
    await query("SELECT * FROM orders WHERE idempotency_key=?", [data.idempotencyKey])
  )[0];
  if (existing) {
    if (existing.request_hash !== requestHash)
      throw conflict("This checkout key was already used for a different order.");
    return {
      order: await getOrder(existing.id),
      lookupToken: lookupTokenFor(existing.id, existing.idempotency_key),
      replayed: true,
    };
  }
  let result;
  try {
    result = await withTransaction(async (connection) => {
      const settings = await getSettings(connection);
      const method = settings.payments[data.paymentMethod];
      if (!method?.enabled) throw invalid("That payment method is currently unavailable.");
      if (["bkash", "nagad"].includes(data.paymentMethod) && method.mode === "gateway") {
        if (
          !settings.payments.sslcommerz.enabled ||
          !settings.payments.sslcommerz.storeId ||
          !settings.payments.sslcommerz.storePassword
        )
          throw invalid("Online payment has not been configured yet.");
        if (!data.customer.email) throw invalid("An email address is required for online payment.");
      }
      if (data.paymentMethod === "bank" && (!method.bankName || !method.accountNumber))
        throw invalid("Bank transfer has not been configured yet.");
      if (
        ["bkash", "nagad"].includes(data.paymentMethod) &&
        method.mode === "manual" &&
        !method.accountNumber
      )
        throw invalid("That receiving account has not been configured yet.");
      const quote = await quoteCart(data, { connection, lock: true });
      if (data.paymentMethod !== "cod" && quote.totalPaise === 0)
        throw new ApiError(
          400,
          "PAYMENT_NOT_REQUIRED",
          "No payment is due. Choose cash on delivery to place this order without a charge.",
        );
      if (["bkash", "nagad"].includes(data.paymentMethod) && method.mode === "gateway")
        validateCheckoutEligibility({
          totalMinor: quote.totalPaise,
          currency: quote.currency,
          customer: { ...data.customer, ...data.shipping },
        });
      const id = randomUUID(),
        token = lookupTokenFor(id, data.idempotencyKey),
        customerId = randomUUID();
      await query(
        "INSERT INTO customers (id,name,email,phone) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),email=COALESCE(VALUES(email),email)",
        [customerId, data.customer.name, data.customer.email || null, data.customer.phone],
        connection,
      );
      const customer = (
        await query("SELECT id FROM customers WHERE phone=?", [data.customer.phone], connection)
      )[0];
      const orderNumber = `FRM${new Date().toISOString().slice(0, 10).replaceAll("-", "")}${randomBytes(4).toString("hex").toUpperCase()}`;
      const gatewayId = `F${randomBytes(14).toString("hex")}`;
      const expires =
        data.paymentMethod === "cod"
          ? null
          : new Date(Date.now() + config.reservationMinutes * 60000);
      await query(
        "INSERT INTO orders (id,order_number,customer_id,customer_json,shipping_json,payment_method,subtotal_paise,discount_paise,shipping_paise,total_paise,coupon_id,coupon_code,reservation_expires_at,idempotency_key,request_hash,lookup_token_hash,gateway_transaction_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          id,
          orderNumber,
          customer.id,
          JSON.stringify(data.customer),
          JSON.stringify(data.shipping),
          data.paymentMethod,
          quote.subtotalPaise,
          quote.discountPaise,
          quote.shippingPaise,
          quote.totalPaise,
          quote.coupon?.id || null,
          quote.couponCode || null,
          expires,
          data.idempotencyKey,
          requestHash,
          hashToken(token),
          gatewayId,
        ],
        connection,
      );
      for (const item of quote.items) {
        const update = await query(
          "UPDATE variants SET reserved=reserved+? WHERE id=? AND stock-reserved>=?",
          [item.quantity, item.variantId, item.quantity],
          connection,
        );
        if (update.affectedRows !== 1)
          throw conflict("An item just sold out. Please refresh your bag.");
        await query(
          "INSERT INTO order_items (id,order_id,variant_id,product_id,name,color_id,color_name,size,sku,quantity,unit_price_paise,total_paise,image_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            randomUUID(),
            id,
            item.variantId,
            item.productId,
            item.name,
            item.colorId,
            item.colorName,
            item.size,
            item.sku,
            item.quantity,
            item.unitPricePaise,
            item.totalPaise,
            item.imageUrl || "",
          ],
          connection,
        );
      }
      if (quote.coupon)
        await query(
          "UPDATE coupons SET used_count=used_count+1 WHERE id=?",
          [quote.coupon.id],
          connection,
        );
      await addOrderEvent(connection, id, "pending", "Order placed.");
      return { id, token };
    });
  } catch (error) {
    // A concurrent retry can wait on the same inventory rows, or hit the unique
    // checkout key after the first transaction commits. Return that exact order
    // rather than reserving its items twice or reporting a false sold-out error.
    const replay = (
      await query("SELECT * FROM orders WHERE idempotency_key=?", [data.idempotencyKey])
    )[0];
    if (replay && replay.request_hash === requestHash)
      return {
        order: await getOrder(replay.id),
        lookupToken: lookupTokenFor(replay.id, replay.idempotency_key),
        replayed: true,
      };
    if (replay) throw conflict("This checkout key was already used for a different order.");
    throw error;
  }
  return { order: await getOrder(result.id), lookupToken: result.token, replayed: false };
}

export async function addOrderEvent(connection, orderId, status, note, actorId = null) {
  await query(
    "INSERT INTO order_events (id,order_id,status,note,actor_id) VALUES (?,?,?,?,?)",
    [randomUUID(), orderId, status, note || null, actorId],
    connection,
  );
}
async function lockedItems(orderId, connection) {
  return query(
    "SELECT variant_id,quantity FROM order_items WHERE order_id=? ORDER BY variant_id",
    [orderId],
    connection,
  );
}
export async function commitOrderStock(order, connection) {
  if (order.reservation_status === "committed") return;
  if (order.reservation_status !== "reserved")
    throw conflict("The inventory reservation has ended. This order needs review.");
  for (const item of await lockedItems(order.id, connection)) {
    const result = await query(
      "UPDATE variants SET stock=stock-?,reserved=reserved-? WHERE id=? AND reserved>=? AND stock>=?",
      [item.quantity, item.quantity, item.variant_id, item.quantity, item.quantity],
      connection,
    );
    if (result.affectedRows !== 1)
      throw conflict("Inventory reconciliation is required before completing this order.");
  }
  await query(
    "UPDATE orders SET reservation_status='committed',reservation_expires_at=NULL WHERE id=?",
    [order.id],
    connection,
  );
  order.reservation_status = "committed";
}
export async function releaseOrderStock(order, connection) {
  if (order.reservation_status === "released") return;
  for (const item of await lockedItems(order.id, connection)) {
    if (order.reservation_status === "reserved")
      await query(
        "UPDATE variants SET reserved=GREATEST(0,reserved-?) WHERE id=?",
        [item.quantity, item.variant_id],
        connection,
      );
    else if (order.reservation_status === "committed")
      await query(
        "UPDATE variants SET stock=stock+? WHERE id=?",
        [item.quantity, item.variant_id],
        connection,
      );
  }
  await query(
    "UPDATE orders SET reservation_status='released',reservation_expires_at=NULL WHERE id=?",
    [order.id],
    connection,
  );
  order.reservation_status = "released";
  if (order.coupon_id && !order.coupon_released) {
    await query(
      "UPDATE coupons SET used_count=GREATEST(0,used_count-1) WHERE id=?",
      [order.coupon_id],
      connection,
    );
    await query("UPDATE orders SET coupon_released=1 WHERE id=?", [order.id], connection);
  }
}
export async function releaseExpiredReservations() {
  const candidates = await query(
    "SELECT id FROM orders WHERE reservation_status='reserved' AND reservation_expires_at<UTC_TIMESTAMP(3) AND status='pending' AND payment_status IN ('unpaid','pending','failed') LIMIT 50",
  );
  for (const candidate of candidates)
    await withTransaction(async (connection) => {
      const order = (
        await query("SELECT * FROM orders WHERE id=? FOR UPDATE", [candidate.id], connection)
      )[0];
      if (
        order.reservation_status !== "reserved" ||
        !["unpaid", "pending", "failed"].includes(order.payment_status) ||
        order.status !== "pending" ||
        new Date(order.reservation_expires_at) > new Date()
      )
        return;
      await releaseOrderStock(order, connection);
      await query("UPDATE orders SET status='cancelled' WHERE id=?", [order.id], connection);
      await addOrderEvent(connection, order.id, "cancelled", "The unpaid reservation expired.");
    });
  return candidates.length;
}

export async function markOrderPaid(
  {
    orderId,
    provider,
    transactionId,
    amountPaise,
    providerReference,
    verifiedPayload,
    paymentId,
    review = false,
    actor,
  },
  connection,
) {
  const settle = async (conn) => {
    const order = (await query("SELECT * FROM orders WHERE id=? FOR UPDATE", [orderId], conn))[0];
    if (!order) throw notFound();
    if (Number(order.total_paise) !== amountPaise)
      throw new ApiError(
        409,
        "PAYMENT_AMOUNT_MISMATCH",
        "The verified payment amount does not match the order.",
      );
    const ledgerId = `${provider}:${transactionId}`;
    const recorded = (
      await query("SELECT * FROM payments WHERE transaction_id=?", [ledgerId], conn)
    )[0];
    if (recorded && recorded.order_id !== orderId)
      throw conflict("That payment reference is already assigned to another order.");
    if (recorded?.status === "paid") return { alreadyPaid: true, review: false };
    if (order.payment_status === "paid") {
      if (recorded?.status === "paid") return { alreadyPaid: true, review: false };
      throw conflict("This order already has a settled payment.");
    }
    const requiresReview =
      review || order.status === "cancelled" || order.reservation_status === "released";
    const status = requiresReview ? "pending_review" : "paid";
    // Settle the independently verified attempt. A later attempt or another
    // submitted reference must retain its own ledger entry.
    const payment = paymentId
      ? (
          await query(
            "SELECT * FROM payments WHERE id=? AND order_id=? AND provider=? FOR UPDATE",
            [paymentId, orderId, provider],
            conn,
          )
        )[0]
      : recorded ||
        (provider === "sslcommerz" && verifiedPayload?.transactionId
          ? (
              await query(
                "SELECT * FROM payments WHERE order_id=? AND provider=? AND gateway_transaction_id=? FOR UPDATE",
                [orderId, provider, verifiedPayload.transactionId],
                conn,
              )
            )[0]
          : null);
    if (paymentId && !payment) throw conflict("That payment attempt does not match the order.");
    if (recorded && payment && recorded.id !== payment.id)
      throw conflict("That payment reference is already assigned to another attempt.");
    if (recorded?.status === "pending_review" && requiresReview && !actor)
      return { alreadyPaid: false, review: true };
    if (payment)
      await query(
        "UPDATE payments SET status=?,amount_paise=?,transaction_id=?,reference=?,verified_payload=?,paid_at=? WHERE id=?",
        [
          status,
          amountPaise,
          ledgerId,
          providerReference || transactionId,
          verifiedPayload ? JSON.stringify(verifiedPayload) : null,
          requiresReview ? null : new Date(),
          payment.id,
        ],
        conn,
      );
    else
      await query(
        "INSERT INTO payments (id,order_id,provider,method,status,amount_paise,transaction_id,reference,verified_payload,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
          randomUUID(),
          orderId,
          provider,
          order.payment_method,
          status,
          amountPaise,
          ledgerId,
          providerReference || transactionId,
          verifiedPayload ? JSON.stringify(verifiedPayload) : null,
          requiresReview ? null : new Date(),
        ],
        conn,
      );
    if (!requiresReview) await commitOrderStock(order, conn);
    await query(
      "UPDATE orders SET payment_status=?,status=CASE WHEN status='pending' AND ?='paid' THEN 'confirmed' ELSE status END,reservation_expires_at=NULL WHERE id=?",
      [status, status, orderId],
      conn,
    );
    await addOrderEvent(
      conn,
      orderId,
      requiresReview ? "payment_review" : "payment_paid",
      requiresReview ? "Payment requires administrator review." : "Payment verified.",
      actor?.id || null,
    );
    await audit(
      actor || null,
      requiresReview ? "payment.review_required" : actor ? "payment.approved" : "payment.verified",
      "order",
      orderId,
      { provider, amountPaise },
      conn,
    );
    return { alreadyPaid: false, review: requiresReview };
  };
  return connection ? settle(connection) : withTransaction(settle);
}

const transitions = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};
export async function updateOrderStatus(id, raw, actor) {
  const data = z
    .object({
      status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]),
      note: z.string().trim().max(2000).optional(),
    })
    .parse(raw);
  await withTransaction(async (connection) => {
    const order = (await query("SELECT * FROM orders WHERE id=? FOR UPDATE", [id], connection))[0];
    if (!order) throw notFound();
    if (order.status === data.status) return;
    if (!transitions[order.status]?.includes(data.status))
      throw conflict(`Cannot move an order from ${order.status} to ${data.status}.`);
    if (data.status === "cancelled") {
      await releaseOrderStock(order, connection);
      if (order.payment_status === "paid")
        await query(
          "UPDATE orders SET payment_status='refund_pending' WHERE id=?",
          [id],
          connection,
        );
    } else {
      if (order.payment_method !== "cod" && order.payment_status !== "paid")
        throw conflict("Verify payment before fulfilling this order.");
      if (["shipped", "delivered"].includes(data.status)) await commitOrderStock(order, connection);
      if (
        data.status === "delivered" &&
        order.payment_method === "cod" &&
        order.payment_status !== "paid"
      )
        await markOrderPaid(
          {
            orderId: id,
            provider: "cod",
            transactionId: id,
            amountPaise: Number(order.total_paise),
            providerReference: "Cash collected on delivery",
            actor,
          },
          connection,
        );
    }
    await query("UPDATE orders SET status=? WHERE id=?", [data.status, id], connection);
    await addOrderEvent(
      connection,
      id,
      data.status,
      data.note || `Order ${data.status}.`,
      actor.id,
    );
    await audit(
      actor,
      "order.status_changed",
      "order",
      id,
      { from: order.status, to: data.status },
      connection,
    );
  });
  return { order: await getOrder(id, { admin: true }) };
}
