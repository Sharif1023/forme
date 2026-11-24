import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const testDatabase = process.env.MYSQL_DATABASE_TEST;
test(
  "dynamic photographic try-on against an isolated MySQL database",
  { skip: !testDatabase },
  async (t) => {
    assert.match(testDatabase, /^[a-zA-Z0-9_]+_test$/, "Use an isolated database ending in _test.");
    process.env.MYSQL_DATABASE = testDatabase;
    process.env.UPLOAD_DIR = path.resolve(".qa/tryon-integration-uploads");
    if (process.env.DATABASE_URL) {
      const url = new URL(process.env.DATABASE_URL);
      url.pathname = `/${testDatabase}`;
      process.env.DATABASE_URL = url.toString();
    }
    const [
      { initializeSchema, seedCatalog },
      { query, closePool },
      { config },
      { saveProduct },
      { hashPassword, encryptSecret },
      { createApp },
      tryon,
    ] = await Promise.all([
      import("./db/bootstrap.mjs"),
      import("./db/pool.mjs"),
      import("./config.mjs"),
      import("./catalog.mjs"),
      import("./security.mjs"),
      import("./app.mjs"),
      import("./tryon.mjs"),
    ]);
    await initializeSchema();
    await seedCatalog();
    const suffix = randomBytes(6).toString("hex"),
      productId = `qa-tryon-${suffix}`,
      ownerId = randomUUID(),
      managerId = randomUUID();
    const password = randomBytes(24).toString("base64url"),
      secretKey = `fake-test-only-${suffix}`;
    const actor = { id: ownerId },
      managerActor = { id: managerId };
    const originalSettings = (
      await query("SELECT value_json FROM settings WHERE setting_key='try-on'")
    )[0];
    const originalUsage = (
      await query("SELECT generation_count FROM tryon_usage WHERE usage_day=UTC_DATE()")
    )[0];
    const files = [],
      jobs = [];
    let server;
    try {
      await query("DELETE FROM tryon_usage WHERE usage_day=UTC_DATE()");
      await query(
        "INSERT INTO admin_users(id,name,email,password_hash,role) VALUES (?,?,?,?, 'owner'),(?,?,?,?, 'manager')",
        [
          ownerId,
          "Try-on QA owner",
          `${suffix}-tryon-owner@example.test`,
          await hashPassword(password),
          managerId,
          "Try-on QA manager",
          `${suffix}-tryon-manager@example.test`,
          await hashPassword(password),
        ],
      );
      await saveProduct(
        {
          id: productId,
          name: "Try-on fixture shirt",
          gender: "men",
          category: "shirts",
          pricePaise: 120000,
          description: "Isolated image generation fixture",
          colors: [{ id: "navy", name: "Navy", hex: "#123456" }],
          sizes: ["M"],
        },
        null,
        actor,
      );
      await mkdir(config.uploadDir, { recursive: true });
      const fixtureImage = async (name, background) => {
        const image = await sharp({ create: { width: 180, height: 240, channels: 4, background } })
          .png()
          .toBuffer();
        const file = path.join(config.uploadDir, `${suffix}-${name}.png`);
        files.push(file);
        await writeFile(file, image);
        return { url: `/uploads/${path.basename(file)}`, buffer: image };
      };
      const firstImage = await fixtureImage("first", "#123456"),
        secondImage = await fixtureImage("second", "#345678");
      const outfit = {
        top: { productId, colorId: "navy", size: "M" },
        bottom: { productId: "m-pant-chino", colorId: "khaki", size: "M" },
        shoes: { productId: "m-shoe-sneaker", colorId: "white", size: "9" },
      };
      const preview = { gender: "men", outfit };
      server = createApp().listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      const request = async (method, pathname, body, auth, headers = {}) => {
        const response = await fetch(base + pathname, {
          method,
          headers: {
            Origin: config.allowedOrigins[0],
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
        const response = await request("POST", "/api/admin/auth/login", { email, password });
        assert.equal(response.status, 200);
        return { cookie: response.cookie, csrfToken: response.data.csrfToken };
      };
      const owner = await login(`${suffix}-tryon-owner@example.test`),
        manager = await login(`${suffix}-tryon-manager@example.test`);
      await t.test(
        "credentials from a previous provider are not forwarded to the direct image service",
        async () => {
          const defaults = await tryon.getTryOnSettings();
          const sourcePhotos = { ...defaults.modelImages };
          await query(
            "INSERT INTO settings(setting_key,value_json) VALUES ('try-on',?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)",
            [
              JSON.stringify({
                ...defaults,
                provider: "previous-service",
                enabled: true,
                apiKey: encryptSecret("legacy-service-secret"),
                model: "previous/model",
                modelImages: sourcePhotos,
              }),
            ],
          );
          const read = await tryon.getTryOnSettings({ includeSecret: true });
          assert.equal(read.provider, "openai");
          assert.equal(read.enabled, false);
          assert.notEqual(read.apiKey, "legacy-service-secret");
          assert.equal(read.model, "gpt-image-2");
          assert.deepEqual(read.modelImages, sourcePhotos);
          // A masked save cannot retain a credential belonging to the previous service.
          const { configured, supportedModels, provider, ...draft } = read;
          await tryon.updateTryOnSettings({ ...draft, enabled: false, apiKey: "********" }, actor);
          const stored = (
            await query("SELECT value_json FROM settings WHERE setting_key='try-on'")
          )[0].value_json;
          assert.equal((typeof stored === "string" ? JSON.parse(stored) : stored).apiKey, "");
        },
      );
      const settingsDraft = {
        ...(await tryon.getTryOnSettings()),
        enabled: false,
        apiKey: secretKey,
        dailyLimit: 20,
      };
      delete settingsDraft.configured;
      delete settingsDraft.supportedModels;
      delete settingsDraft.provider;
      await t.test(
        "AI settings enforce roles, CSRF, encryption and masked-key preservation",
        async () => {
          assert.equal(
            (await request("GET", "/api/admin/try-on/settings", undefined, manager)).status,
            403,
          );
          assert.equal(
            (
              await request("PATCH", "/api/admin/try-on/settings", settingsDraft, owner, {
                "X-CSRF-Token": "wrong",
              })
            ).status,
            403,
          );
          const saved = await request("PATCH", "/api/admin/try-on/settings", settingsDraft, owner);
          assert.equal(saved.status, 200);
          assert.equal(saved.data.apiKey, "********");
          assert.equal(saved.data.configured, true);
          const raw = JSON.stringify(
            (await query("SELECT value_json FROM settings WHERE setting_key='try-on'"))[0],
          );
          assert(!raw.includes(secretKey));
          assert(raw.includes("enc:v1:"));
          settingsDraft.apiKey = "********";
          const preserved = await request(
            "PATCH",
            "/api/admin/try-on/settings",
            settingsDraft,
            owner,
          );
          assert.equal(preserved.status, 200);
          assert.equal((await tryon.getTryOnSettings({ includeSecret: true })).apiKey, secretKey);
          assert(!JSON.stringify((await request("GET", "/api/catalog")).data).includes(secretKey));
        },
      );
      await t.test(
        "product sources are local images with complete colour coverage and manager access",
        async () => {
          assert.equal(
            (
              await request(
                "PATCH",
                `/api/admin/products/${productId}/try-on`,
                { enabled: true, colorImages: {} },
                manager,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await request(
                "PATCH",
                `/api/admin/products/${productId}/try-on`,
                { enabled: true, colorImages: { navy: "https://example.com/shirt.png" } },
                manager,
              )
            ).status,
            400,
          );
          await assert.rejects(() => tryon.readTryOnSource("/uploads/../.env.png"));
          const saved = await request(
            "PATCH",
            `/api/admin/products/${productId}/try-on`,
            { enabled: true, colorImages: { navy: firstImage.url } },
            manager,
          );
          assert.equal(saved.status, 200);
          assert.equal(saved.data.ready, true);
          const product = (await request("GET", "/api/catalog")).data.products.find(
            (product) => product.id === productId,
          );
          assert.equal(product.previewSupported, false);
          assert.equal(product.tryOn.enabled, true);
          assert.equal(product.tryOn.ready, true);
          assert.equal(typeof product.tryOn.revision, "string");
        },
      );
      await t.test(
        "existing frames are free and thumbnail or disabled-service requests never enqueue",
        async () => {
          const ready = await tryon.requestTryOnPreview({
            gender: "men",
            outfit: { ...outfit, top: { productId: "m-shirt-oxford", colorId: "sky", size: "M" } },
          });
          assert.equal(ready.status, "ready");
          assert.match(ready.imageUrl, /^\/images\/looks\/men\//);
          assert.equal(
            (await tryon.requestTryOnPreview({ ...preview, generate: false })).status,
            "unavailable",
          );
          assert.equal((await tryon.requestTryOnPreview(preview)).status, "unavailable");
          assert.equal(
            (
              await query(
                "SELECT COUNT(*) AS count FROM tryon_jobs WHERE JSON_UNQUOTE(JSON_EXTRACT(outfit_json,'$.outfit.top.productId'))=?",
                [productId],
              )
            )[0].count,
            0,
          );
          await assert.rejects(() => tryon.requestTryOnPreview({ ...preview, gender: "women" }));
          await assert.rejects(() =>
            tryon.requestTryOnPreview({
              ...preview,
              outfit: { ...outfit, top: { ...outfit.top, size: "99" } },
            }),
          );
        },
      );
      let firstJob;
      await t.test(
        "concurrent exact-outfit requests deduplicate one paid generation reservation",
        async () => {
          settingsDraft.enabled = true;
          await tryon.updateTryOnSettings(settingsDraft, actor);
          const settled = await Promise.allSettled(
            Array.from({ length: 8 }, () => tryon.requestTryOnPreview(preview)),
          );
          const responses = settled
            .filter((item) => item.status === "fulfilled")
            .map((item) => item.value);
          // Wait for every contender before asserting, so failure cleanup cannot
          // race transactions that are still reserving a queue slot.
          assert.deepEqual(
            settled
              .filter((item) => item.status === "rejected")
              .map((item) => item.reason?.code || item.reason?.message),
            [],
          );
          assert(responses.every((item) => item.status === "pending"));
          assert.equal(new Set(responses.map((item) => item.jobId)).size, 1);
          firstJob = responses[0];
          jobs.push(firstJob.jobId);
          assert.equal(
            Number(
              (
                await query("SELECT generation_count FROM tryon_usage WHERE usage_day=UTC_DATE()")
              )[0].generation_count,
            ),
            1,
          );
        },
      );
      await t.test(
        "a mocked provider creates a real normalized whole-frame image and cached results survive disabling generation",
        async () => {
          let calls = 0;
          await tryon.processTryOnJobs({
            jobId: firstJob.jobId,
            generateImage: async (input) => {
              calls++;
              assert.equal(input.apiKey, secretKey);
              assert.deepEqual(
                input.referenceImages.map((image) => image.role),
                ["model", "top", "bottom", "shoes"],
              );
              assert(
                input.referenceImages.every((image) => image.dataUrl.startsWith("data:image/")),
              );
              return { buffer: firstImage.buffer, mimeType: "image/png" };
            },
          });
          assert.equal(calls, 1);
          const ready = await tryon.getTryOnJob(firstJob.jobId);
          assert.equal(ready.status, "ready");
          assert.match(ready.imageUrl, /^\/uploads\/try-on\/[a-f0-9-]+\.webp$/);
          files.push(path.join(config.uploadDir, ready.imageUrl.slice("/uploads/".length)));
          const response = await fetch(base + ready.imageUrl);
          assert.equal(response.status, 200);
          const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
          assert.equal(metadata.width, 680);
          assert.equal(metadata.height, 1000);
          assert.equal(metadata.format, "webp");
          settingsDraft.enabled = false;
          await tryon.updateTryOnSettings(settingsDraft, actor);
          assert.equal(
            (await tryon.requestTryOnPreview({ ...preview, generate: false })).imageUrl,
            ready.imageUrl,
          );
          settingsDraft.enabled = true;
          await tryon.updateTryOnSettings(settingsDraft, actor);
        },
      );
      await t.test(
        "source revisions invalidate stale frames and failed work retries only explicitly",
        async () => {
          await tryon.updateProductTryOn(
            productId,
            { enabled: true, colorImages: { navy: secondImage.url } },
            managerActor,
          );
          assert.equal((await tryon.getTryOnJob(firstJob.jobId)).status, "unavailable");
          const next = await tryon.requestTryOnPreview(preview);
          assert.notEqual(next.key, firstJob.key);
          jobs.push(next.jobId);
          await tryon.processTryOnJobs({
            jobId: next.jobId,
            generateImage: async () => {
              throw new Error(`Private provider failure ${secretKey}`);
            },
          });
          const failed = await tryon.getTryOnJob(next.jobId);
          assert.equal(failed.status, "failed");
          assert(!failed.message.includes(secretKey));
          const before = Number(
            (await query("SELECT generation_count FROM tryon_usage WHERE usage_day=UTC_DATE()"))[0]
              .generation_count,
          );
          assert.equal((await tryon.requestTryOnPreview(preview)).status, "failed");
          assert.equal(
            Number(
              (
                await query("SELECT generation_count FROM tryon_usage WHERE usage_day=UTC_DATE()")
              )[0].generation_count,
            ),
            before,
          );
          assert.equal(
            (await tryon.requestTryOnPreview({ ...preview, retry: true })).status,
            "pending",
          );
          assert.equal(
            Number(
              (
                await query("SELECT generation_count FROM tryon_usage WHERE usage_day=UTC_DATE()")
              )[0].generation_count,
            ),
            before + 1,
          );
          let calls = 0;
          const generator = async () => {
            calls++;
            await new Promise((resolve) => setTimeout(resolve, 35));
            return { buffer: secondImage.buffer, mimeType: "image/png" };
          };
          const settled = await Promise.allSettled([
            tryon.processTryOnJobs({ jobId: next.jobId, generateImage: generator }),
            tryon.processTryOnJobs({ jobId: next.jobId, generateImage: generator }),
          ]);
          assert(settled.every((item) => item.status === "fulfilled"));
          assert.equal(calls, 1);
          const ready = await tryon.getTryOnJob(next.jobId);
          assert.equal(ready.status, "ready");
          files.push(path.join(config.uploadDir, ready.imageUrl.slice("/uploads/".length)));
        },
      );
      await t.test(
        "the daily generation cap rejects new combinations before they spend a slot",
        async () => {
          const count = Number(
            (await query("SELECT generation_count FROM tryon_usage WHERE usage_day=UTC_DATE()"))[0]
              .generation_count,
          );
          settingsDraft.dailyLimit = count;
          settingsDraft.modelImages.men = firstImage.url;
          await tryon.updateTryOnSettings(settingsDraft, actor);
          const response = await tryon.requestTryOnPreview(preview);
          assert.equal(response.status, "unavailable");
          assert.match(response.message, /daily preview limit/);
          assert.equal(
            Number(
              (
                await query("SELECT generation_count FROM tryon_usage WHERE usage_day=UTC_DATE()")
              )[0].generation_count,
            ),
            count,
          );
          assert.equal(
            (
              await query(
                "SELECT COUNT(*) AS count FROM tryon_jobs WHERE JSON_UNQUOTE(JSON_EXTRACT(outfit_json,'$.outfit.top.productId'))=?",
                [productId],
              )
            )[0].count,
            2,
          );
        },
      );
      await t.test(
        "yesterday's pending job cannot starve today's reserved work when the daily budget is full",
        async () => {
          settingsDraft.dailyLimit = 20;
          await tryon.updateTryOnSettings(settingsDraft, actor);
          const carried = await tryon.requestTryOnPreview(preview);
          jobs.push(carried.jobId);
          assert.equal(carried.status, "pending");
          // Model an actual midnight rollover. Ancient creation times put only
          // these owned fixtures at the queue head, without modifying other jobs.
          await query(
            "UPDATE tryon_jobs SET created_at='1970-01-01',updated_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY) WHERE id=?",
            [carried.jobId],
          );
          await query("UPDATE tryon_usage SET generation_count=0 WHERE usage_day=UTC_DATE()");
          const current = await tryon.requestTryOnPreview({
            ...preview,
            outfit: { ...outfit, bottom: { ...outfit.bottom, colorId: "navy" } },
          });
          jobs.push(current.jobId);
          assert.equal(current.status, "pending");
          await query(
            "UPDATE tryon_jobs SET created_at='1970-01-02',updated_at=UTC_TIMESTAMP(3) WHERE id=?",
            [current.jobId],
          );
          settingsDraft.dailyLimit = 1;
          await tryon.updateTryOnSettings(settingsDraft, actor);
          let calls = 0;
          const generateImage = async () => {
            calls++;
            return { buffer: firstImage.buffer, mimeType: "image/png" };
          };
          assert.equal(
            await tryon.processTryOnJobs({ jobId: carried.jobId, generateImage }),
            false,
          );
          assert.equal(calls, 0);
          assert.equal(await tryon.processTryOnJobs({ generateImage }), true);
          assert.equal(calls, 1);
          const ready = await tryon.getTryOnJob(current.jobId);
          assert.equal(ready.status, "ready");
          files.push(path.join(config.uploadDir, ready.imageUrl.slice("/uploads/".length)));
          assert.equal((await tryon.getTryOnJob(carried.jobId)).status, "pending");
          assert.equal(
            Number(
              (
                await query("SELECT generation_count FROM tryon_usage WHERE usage_day=UTC_DATE()")
              )[0].generation_count,
            ),
            1,
          );
          // A carried job still runs normally once one new-day slot is free.
          settingsDraft.dailyLimit = 2;
          await tryon.updateTryOnSettings(settingsDraft, actor);
          assert.equal(await tryon.processTryOnJobs({ jobId: carried.jobId, generateImage }), true);
          assert.equal(calls, 2);
          const carriedReady = await tryon.getTryOnJob(carried.jobId);
          assert.equal(carriedReady.status, "ready");
          files.push(path.join(config.uploadDir, carriedReady.imageUrl.slice("/uploads/".length)));
          assert.equal(
            Number(
              (
                await query("SELECT generation_count FROM tryon_usage WHERE usage_day=UTC_DATE()")
              )[0].generation_count,
            ),
            2,
          );
        },
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      try {
        await query(
          "DELETE FROM tryon_jobs WHERE JSON_UNQUOTE(JSON_EXTRACT(outfit_json,'$.outfit.top.productId'))=?",
          [productId],
        );
        await query("DELETE FROM variants WHERE product_id=?", [productId]);
        await query("DELETE FROM products WHERE id=?", [productId]);
        for (const id of [ownerId, managerId]) {
          await query("DELETE FROM sessions WHERE admin_id=?", [id]);
          await query("DELETE FROM audit_logs WHERE actor_id=?", [id]);
          await query("DELETE FROM admin_users WHERE id=?", [id]);
        }
        if (originalSettings)
          await query(
            "INSERT INTO settings(setting_key,value_json) VALUES ('try-on',?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)",
            [
              typeof originalSettings.value_json === "string"
                ? originalSettings.value_json
                : JSON.stringify(originalSettings.value_json),
            ],
          );
        else await query("DELETE FROM settings WHERE setting_key='try-on'");
        if (originalUsage)
          await query(
            "INSERT INTO tryon_usage(usage_day,generation_count) VALUES (UTC_DATE(),?) ON DUPLICATE KEY UPDATE generation_count=VALUES(generation_count)",
            [originalUsage.generation_count],
          );
        else await query("DELETE FROM tryon_usage WHERE usage_day=UTC_DATE()");
      } finally {
        for (const file of files) await unlink(file).catch(() => undefined);
        await closePool();
      }
    }
  },
);
