import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const testDatabase = process.env.MYSQL_DATABASE_TEST;

test("commerce against an isolated real MySQL database", { skip: !testDatabase }, async (t) => {
  assert.match(
    testDatabase,
    /^[a-zA-Z0-9_]+_test$/,
    "Use a separate database whose name ends in _test.",
  );
  process.env.MYSQL_DATABASE = testDatabase;
  process.env.UPLOAD_DIR=path.resolve(".qa/integration-uploads");
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${testDatabase}`;
    process.env.DATABASE_URL = url.toString();
  }
  const [
    { createApp },
    { query, withTransaction, closePool },
    { initializeSchema, seedCatalog },
    { hashPassword },
    { markOrderPaid },
    { config },
  ] = await Promise.all([
    import("./app.mjs"),
    import("./db/pool.mjs"),
    import("./db/bootstrap.mjs"),
    import("./security.mjs"),
    import("./orders.mjs"),
    import("./config.mjs"),
  ]);
  await initializeSchema();
  await seedCatalog();
  const suffix = randomBytes(6).toString("hex"),
    ownerId = randomUUID(),
    managerId = randomUUID(),
    productId = `qa-${suffix}`,
    password = randomBytes(24).toString("base64url");
  const ownerEmail = `qa-owner-${suffix}@example.test`,
    managerEmail = `qa-manager-${suffix}@example.test`;
  const phone = `019${String(Number.parseInt(suffix.slice(0, 6), 16))
    .padStart(8, "0")
    .slice(-8)}`;
  let couponId;
  const uploadFiles=[];
  const adminIds = [ownerId, managerId],
    orderIds = [],
    customerIds = [];
  const originalSettings = await query(
    "SELECT setting_key,value_json FROM settings WHERE setting_key IN ('shop','shipping','payments')",
  );
  await query(
    "INSERT INTO admin_users (id,name,email,password_hash,role) VALUES (?,?,?,?, 'owner'),(?,?,?,?, 'manager')",
    [
      ownerId,
      "QA owner",
      ownerEmail,
      await hashPassword(password),
      managerId,
      "QA manager",
      managerEmail,
      await hashPassword(password),
    ],
  );
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`,
    origin = config.allowedOrigins[0];
  const request = async (method, url, body, auth, headers = {}) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        Origin: origin,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrfToken } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    return {
      status: response.status,
      data: payload.data,
      error: payload.error,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const login = async (email) => {
    const result = await request("POST", "/api/admin/auth/login", { email, password });
    assert.equal(result.status, 200, JSON.stringify(result.error));
    return { cookie: result.cookie, csrfToken: result.data.csrfToken };
  };
  const owner = await login(ownerEmail),
    manager = await login(managerEmail);
  let variantId, secondVariantId, manualOrder, manualToken;
  const checkout = (quantity = 1, extra = {}) => ({
    customer: { name: "Integration customer", phone, email: `qa-${suffix}@example.test` },
    shipping: { address: "12 Test Road, test fixture only", city: "Dhaka", postalCode: "1207" },
    items: [{ variantId, quantity }],
    paymentMethod: "cod",
    idempotencyKey: `qa-${randomUUID()}`,
    ...extra,
  });
  const remember = (result) => {
    if (result.data?.order?.id && !orderIds.includes(result.data.order.id))
      orderIds.push(result.data.order.id);
    return result;
  };
  try {
    await t.test("sessions, CSRF and owner/manager permissions", async () => {
      const me = await request("GET", "/api/admin/auth/me", undefined, owner);
      assert.equal(me.data.admin.role, "owner");
      assert.ok(me.data.csrfToken.length > 20);
      const withoutCsrf = await request(
        "PATCH",
        "/api/admin/settings",
        { shop: { name: "not allowed" } },
        { cookie: owner.cookie, csrfToken: "" },
      );
      assert.equal(withoutCsrf.status, 403);
      const forbidden = await request(
        "PATCH",
        "/api/admin/settings",
        { payments: { cod: { enabled: true } } },
        manager,
      );
      assert.equal(forbidden.status, 403);
      const staff = await request("GET", "/api/admin/staff", undefined, manager);
      assert.equal(staff.status, 403);
      const badOrigin = await request(
        "POST",
        "/api/admin/auth/login",
        { email: ownerEmail, password },
        undefined,
        { Origin: "https://untrusted.example" },
      );
      assert.equal(badOrigin.status, 403);
    });
    await t.test(
      "seeded product images preserve every colour and custom variants are editable",
      async () => {
        const catalog = await request("GET", "/api/catalog");
        const prepared = catalog.data.products.filter((product) => product.previewSupported);
        assert.equal(prepared.length, 24);
        let photos = 0;
        for (const product of prepared) {
          assert.equal(product.imageUrl, null);
          for (const color of product.colors) {
            assert.ok(
              existsSync(path.resolve("public/images/products", `${product.id}--${color.id}.webp`)),
            );
            photos++;
          }
        }
        assert.equal(photos, 72);
        const created = await request(
          "POST",
          "/api/admin/products",
          {
            id: productId,
            name: "Integration fixture tee",
            gender: "men",
            category: "tshirts",
            description: "Isolated integration fixture.",
            pricePaise: 99000,
            active: true,
            colors: [
              { id: "navy", name: "Navy", hex: "#223344" },
              { id: "cream", name: "Cream", hex: "#EEE8DC" },
            ],
            sizes: ["M"],
            style: { kind: "tee", neckline: "crew", fit: "regular" },
          },
          owner,
        );
        assert.equal(created.status, 201, JSON.stringify(created.error));
        assert.equal(created.data.product.previewSupported, false);
        variantId = created.data.variants.find((variant) => variant.colorId === "navy").id;
        secondVariantId = created.data.variants.find((variant) => variant.colorId === "cream").id;
        for (const id of [variantId, secondVariantId]) {
          const update = await request(
            "PATCH",
            `/api/admin/inventory/${encodeURIComponent(id)}`,
            { stock: 3 },
            manager,
          );
          assert.equal(update.status, 200);
        }
      },
    );
    await t.test("quotes ignore forged prices and aggregate duplicate variants", async () => {
      const body = checkout(1, {
        items: [
          { variantId, quantity: 1, unitPricePaise: 1 },
          { variantId, quantity: 2, pricePaise: 1 },
        ],
      });
      const quote = await request("POST", "/api/checkout/quote", body);
      assert.equal(quote.status, 200);
      assert.equal(quote.data.items.length, 1);
      assert.equal(quote.data.items[0].quantity, 3);
      assert.equal(quote.data.subtotalPaise, 297000);
      const [first, retry] = await Promise.all([
        request("POST", "/api/orders", body).then(remember),
        request("POST", "/api/orders", body).then(remember),
      ]);
      assert.ok([200, 201].includes(first.status), JSON.stringify(first.error));
      assert.ok([200, 201].includes(retry.status), JSON.stringify(retry.error));
      assert.equal(first.data.order.id, retry.data.order.id);
      let stock = (await query("SELECT stock,reserved FROM variants WHERE id=?", [variantId]))[0];
      assert.equal(stock.stock, 3);
      assert.equal(stock.reserved, 3);
      const soldOut = await request("POST", "/api/orders", checkout());
      assert.equal(soldOut.status, 409);
      for (let n = 0; n < 2; n++) {
        const cancel = await request(
          "PATCH",
          `/api/admin/orders/${first.data.order.id}/status`,
          { status: "cancelled" },
          owner,
        );
        assert.equal(cancel.status, 200);
      }
      stock = (await query("SELECT stock,reserved FROM variants WHERE id=?", [variantId]))[0];
      assert.equal(stock.stock, 3);
      assert.equal(stock.reserved, 0);
    });
    await t.test("competing reservations cannot oversell", async () => {
      const outcomes = await Promise.all([
        request("POST", "/api/orders", checkout(2)).then(remember),
        request("POST", "/api/orders", checkout(2)).then(remember),
      ]);
      assert.deepEqual(outcomes.map((result) => result.status).sort(), [201, 409]);
      const winner = outcomes.find((result) => result.status === 201);
      const stock = (await query("SELECT stock,reserved FROM variants WHERE id=?", [variantId]))[0];
      assert.equal(stock.reserved, 2);
      assert.equal(stock.stock, 3);
      await request(
        "PATCH",
        `/api/admin/orders/${winner.data.order.id}/status`,
        { status: "cancelled" },
        owner,
      );
    });
    await t.test(
      "payment credentials are encrypted, masked and disabled until configured",
      async () => {
        const secret = `qa-password-${suffix}`;
        const settings = await request(
          "PATCH",
          "/api/admin/settings",
          {
            payments: {
              sslcommerz: {
                enabled: false,
                environment: "sandbox",
                storeId: `qa-store-${suffix}`,
                storePassword: secret,
              },
              bkash: {
                enabled: true,
                mode: "manual",
                accountNumber: "01712345678",
                instructions: "Integration fixture only",
              },
            },
          },
          owner,
        );
        assert.equal(settings.status, 200, JSON.stringify(settings.error));
        assert.equal(settings.data.payments.sslcommerz.storePassword, "********");
        const stored = (
          await query("SELECT value_json FROM settings WHERE setting_key='payments'")
        )[0];
        const value =
          typeof stored.value_json === "string"
            ? stored.value_json
            : JSON.stringify(stored.value_json);
        assert.ok(value.includes("enc:v1:"));
        assert.ok(!value.includes(secret));
        const publicConfig = await request("GET", "/api/store/settings");
        assert.equal(publicConfig.data.payments.sslcommerz, undefined);
        assert.ok(!JSON.stringify(publicConfig.data).includes(secret));
        const missingGateway = await request(
          "PATCH",
          "/api/admin/settings",
          { payments: { nagad: { enabled: true, mode: "gateway" } } },
          owner,
        );
        assert.equal(missingGateway.status, 400);
      },
    );
    await t.test(
      "manual proof is review-only, references cannot be reused, unpaid orders cannot ship",
      async () => {
        const first = remember(
          await request("POST", "/api/orders", checkout(1, { paymentMethod: "bkash" })),
        );
        assert.equal(first.status, 201);
        manualOrder = first.data.order.id;
        manualToken = first.data.lookupToken;
        const second = remember(
          await request(
            "POST",
            "/api/orders",
            checkout(1, {
              items: [{ variantId: secondVariantId, quantity: 1 }],
              paymentMethod: "bkash",
            }),
          ),
        );
        assert.equal(second.status, 201);
        const reference = `QA${suffix.toUpperCase()}`;
        const proof = await request("POST", `/api/orders/${manualOrder}/payment-proof`, {
          lookupToken: manualToken,
          reference,
          senderPhone: "01712345678",
        });
        assert.equal(proof.status, 200);
        assert.equal(proof.data.order.paymentStatus, "pending_review");
        const reused = await request("POST", `/api/orders/${second.data.order.id}/payment-proof`, {
          lookupToken: second.data.lookupToken,
          reference: `${reference.slice(0, 4)}-${reference.slice(4)}`,
          senderPhone: "01712345678",
        });
        assert.equal(reused.status, 409);
        const shipping = await request(
          "PATCH",
          `/api/admin/orders/${manualOrder}/status`,
          { status: "shipped" },
          owner,
        );
        assert.equal(shipping.status, 409);
        const forbidden = await request(
          "POST",
          `/api/admin/orders/${manualOrder}/approve-payment`,
          { reference },
          manager,
        );
        assert.equal(forbidden.status, 403);
        const approved = await request(
          "POST",
          `/api/admin/orders/${manualOrder}/approve-payment`,
          { reference },
          owner,
        );
        assert.equal(approved.status, 200, JSON.stringify(approved.error));
        assert.equal(approved.data.order.paymentStatus, "paid");
        await request(
          "POST",
          `/api/admin/orders/${manualOrder}/approve-payment`,
          { reference },
          owner,
        );
        let stock = (await query("SELECT stock,reserved FROM variants WHERE id=?", [variantId]))[0];
        assert.equal(stock.stock, 2);
        assert.equal(stock.reserved, 0);
        for (const status of ["processing", "shipped", "delivered"]) {
          const update = await request(
            "PATCH",
            `/api/admin/orders/${manualOrder}/status`,
            { status },
            owner,
          );
          assert.equal(update.status, 200, JSON.stringify(update.error));
        }
        stock = (await query("SELECT stock,reserved FROM variants WHERE id=?", [variantId]))[0];
        assert.equal(stock.stock, 2);
        assert.equal(stock.reserved, 0);
        const lookup = await request("POST", "/api/orders/lookup", {
          orderId: manualOrder,
          lookupToken: manualToken,
        });
        assert.equal(lookup.status, 200);
        assert.equal(lookup.data.order.status, "delivered");
        await request(
          "PATCH",
          `/api/admin/orders/${second.data.order.id}/status`,
          { status: "cancelled" },
          owner,
        );
      },
    );
    await t.test(
      "late verified payments stay under review without recreating released stock",
      async () => {
        const created = remember(await request("POST", "/api/orders", checkout()));
        assert.equal(created.status, 201);
        const id = created.data.order.id;
        await request("PATCH", `/api/admin/orders/${id}/status`, { status: "cancelled" }, owner);
        const before = (
          await query("SELECT stock,reserved FROM variants WHERE id=?", [variantId])
        )[0];
        await markOrderPaid({
          orderId: id,
          provider: "sslcommerz",
          transactionId: `QA${suffix}`,
          amountPaise: created.data.order.totalPaise,
          providerReference: `QA${suffix}`,
          verifiedPayload: { transactionId: `QA${suffix}`, validationId: `QA${suffix}` },
        });
        const after = (
          await query("SELECT stock,reserved FROM variants WHERE id=?", [variantId])
        )[0];
        assert.deepEqual(after, before);
        const order = (
          await query("SELECT status,payment_status,reservation_status FROM orders WHERE id=?", [
            id,
          ])
        )[0];
        assert.equal(order.status, "cancelled");
        assert.equal(order.payment_status, "pending_review");
        assert.equal(order.reservation_status, "released");
        const logged = await query(
          "SELECT id FROM audit_logs WHERE action='payment.review_required' AND entity_id=?",
          [id],
        );
        assert.equal(logged.length, 1);
      },
    );
    await t.test(
      "changing a prepared palette disables studio preview and obsolete variants",
      async () => {
        const created = await request(
          "POST",
          "/api/admin/products",
          {
            id: `${productId}-preview`,
            name: "Preview fixture",
            gender: "women",
            category: "tshirts",
            description: "",
            pricePaise: 50000,
            active: true,
            colors: [{ id: "ivory", name: "Ivory", hex: "#EFE9DE" }],
            sizes: ["M"],
            style: { kind: "tee", neckline: "crew", fit: "fitted" },
          },
          owner,
        );
        assert.equal(created.status, 201);
        await query("UPDATE products SET studio_supported=1 WHERE id=?", [`${productId}-preview`]);
        const unchanged = await request(
          "PATCH",
          `/api/admin/products/${productId}-preview`,
          { name: "Renamed fixture", pricePaise: 51000 },
          owner,
        );
        assert.equal(unchanged.data.product.previewSupported, true);
        const changed = await request(
          "PATCH",
          `/api/admin/products/${productId}-preview`,
          { colors: [{ id: "rose", name: "Rose", hex: "#C99A92" }] },
          owner,
        );
        assert.equal(changed.data.product.previewSupported, false);
        const old = changed.data.variants.find((variant) => variant.colorId === "ivory");
        assert.equal(old.active, false);
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try {
      await withTransaction(async (connection) => {
        const ids = await query(
          "SELECT id,customer_id FROM orders WHERE idempotency_key LIKE ?",
          [`qa-%`],
          connection,
        );
        const ownIds = ids.filter((row) => orderIds.includes(row.id));
        for (const row of ownIds) {
          customerIds.push(row.customer_id);
          for (const table of ["order_events", "payments", "order_items"])
            await query(`DELETE FROM ${table} WHERE order_id=?`, [row.id], connection);
          await query("DELETE FROM audit_logs WHERE entity_id=?", [row.id], connection);
          await query("DELETE FROM orders WHERE id=?", [row.id], connection);
        }
        for (const id of new Set(customerIds))
          await query(
            "DELETE FROM customers WHERE id=? AND NOT EXISTS(SELECT 1 FROM orders WHERE customer_id=?)",
            [id, id],
            connection,
          );
        await query(
          "DELETE FROM variants WHERE product_id IN (?,?)",
          [productId, `${productId}-preview`],
          connection,
        );
        await query(
          "DELETE FROM products WHERE id IN (?,?)",
          [productId, `${productId}-preview`],
          connection,
        );
        await query("DELETE FROM coupons WHERE id=?", [couponId], connection);
        for (const id of adminIds) {
          await query("DELETE FROM sessions WHERE admin_id=?", [id], connection);
          await query("DELETE FROM audit_logs WHERE actor_id=?", [id], connection);
          await query("DELETE FROM admin_users WHERE id=?", [id], connection);
        }
        for (const key of ["shop", "shipping", "payments"]) {
          const previous = originalSettings.find((row) => row.setting_key === key);
          if (previous)
            await query(
              "INSERT INTO settings (setting_key,value_json) VALUES (?,?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)",
              [
                key,
                typeof previous.value_json === "string"
                  ? previous.value_json
                  : JSON.stringify(previous.value_json),
              ],
              connection,
            );
          else await query("DELETE FROM settings WHERE setting_key=?", [key], connection);
        }
      });
    } finally {
      await closePool();
    }
  }
});
