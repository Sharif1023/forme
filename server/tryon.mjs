import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { z } from "zod";
import { query, withTransaction, getPool } from "./db/pool.mjs";
import { config } from "./config.mjs";
import { jsonValue, audit } from "./audit.mjs";
import { encryptSecret, decryptSecret } from "./security.mjs";
import { ApiError, invalid, notFound } from "./errors.mjs";
import {
  generateTryOnImage,
  DEFAULT_TRYON_MODEL,
  SUPPORTED_TRYON_MODELS,
} from "./tryon/provider.mjs";

const PUBLIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const SLOTS = ["top", "bottom", "shoes"];
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const DEFAULTS = {
  enabled: false,
  apiKey: "",
  model: DEFAULT_TRYON_MODEL,
  dailyLimit: 20,
  modelImages: {
    men: "/images/looks/men/m-shirt-oxford--sky__m-pant-chino--khaki__m-shoe-sneaker--white.webp",
    women:
      "/images/looks/women/w-shirt-camp--champagne__w-pant-jean--indigo__w-shoe-pump--black.webp",
  },
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const localImage = z
  .string()
  .max(1024)
  .refine(
    (value) =>
      /^\/(?:uploads|images)\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp)$/i.test(value) &&
      !value.split("/").some((part) => part === "." || part === ".."),
    "Upload a PNG, JPEG or WebP image to this store first.",
  );
const slotFor = (category) =>
  category === "pants" ? "bottom" : category === "shoes" ? "shoes" : "top";
const sourceFailure = () =>
  invalid(
    "A preview source image is missing or invalid. Upload a clear PNG, JPEG or WebP photo in the admin panel.",
  );

/** Only read existing files under our public image/upload roots; never fetch product URLs. */
export async function readTryOnSource(imagePath) {
  localImage.parse(imagePath);
  const uploads = imagePath.startsWith("/uploads/");
  const root = uploads ? config.uploadDir : PUBLIC_ROOT;
  const relative = uploads ? imagePath.slice("/uploads/".length) : imagePath.slice(1);
  const candidate = path.resolve(root, relative);
  try {
    const [actual, actualRoot] = await Promise.all([realpath(candidate), realpath(root)]);
    const inside = path.relative(actualRoot, actual);
    if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) throw sourceFailure();
    const info = await stat(actual);
    if (!info.isFile() || info.size < 12 || info.size > MAX_SOURCE_BYTES) throw sourceFailure();
    const buffer = await readFile(actual);
    const metadata = await sharp(buffer, { limitInputPixels: 16_777_216 }).metadata();
    if (
      !["png", "jpeg", "webp"].includes(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width < 64 ||
      metadata.height < 64 ||
      (metadata.pages ?? 1) > 1
    )
      throw sourceFailure();
    const mimeType = metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`;
    return {
      buffer,
      digest: hash(buffer),
      mimeType,
      dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
    };
  } catch (error) {
    if (error?.name === "ZodError") throw error;
    throw sourceFailure();
  }
}

async function rawSettings(connection) {
  const rows = await query(
    "SELECT value_json FROM settings WHERE setting_key='try-on'",
    [],
    connection,
  );
  const saved = jsonValue(rows[0]?.value_json, {});
  return {
    ...structuredClone(DEFAULTS),
    ...saved,
    modelImages: { ...DEFAULTS.modelImages, ...saved.modelImages },
  };
}
export async function getTryOnSettings({ includeSecret = false, connection } = {}) {
  const settings = await rawSettings(connection);
  const environmentKey = process.env.LOVABLE_API_KEY || "";
  const configured = !!settings.apiKey || !!environmentKey;
  return {
    ...settings,
    apiKey: includeSecret
      ? settings.apiKey
        ? decryptSecret(settings.apiKey)
        : environmentKey
      : configured
        ? "********"
        : "",
    configured,
    supportedModels: [...SUPPORTED_TRYON_MODELS],
  };
}
export async function updateTryOnSettings(raw, actor) {
  const data = z
    .object({
      enabled: z.boolean(),
      apiKey: z.string().max(8192),
      model: z.enum(SUPPORTED_TRYON_MODELS),
      dailyLimit: z.number().int().min(1).max(1000),
      modelImages: z.object({ men: localImage, women: localImage }).strict(),
    })
    .strict()
    .parse(raw);
  await Promise.all(Object.values(data.modelImages).map(readTryOnSource));
  return withTransaction(async (connection) => {
    // Lock one fixed settings row so concurrent masked-key updates cannot discard a newer key.
    await query(
      "INSERT INTO settings (setting_key,value_json) VALUES ('try-on',?) ON DUPLICATE KEY UPDATE setting_key=VALUES(setting_key)",
      [JSON.stringify(DEFAULTS)],
      connection,
    );
    await query(
      "SELECT setting_key FROM settings WHERE setting_key='try-on' FOR UPDATE",
      [],
      connection,
    );
    const prior = await rawSettings(connection);
    const enteredKey = data.apiKey.trim();
    const apiKey =
      enteredKey === "********" ? prior.apiKey : enteredKey ? encryptSecret(enteredKey) : "";
    if (data.enabled && !apiKey && !process.env.LOVABLE_API_KEY)
      throw invalid("Add the AI gateway key before enabling image generation.");
    await query(
      "UPDATE settings SET value_json=? WHERE setting_key='try-on'",
      [JSON.stringify({ ...data, apiKey })],
      connection,
    );
    await audit(
      actor,
      "tryon.settings.updated",
      "settings",
      "try-on",
      { enabled: data.enabled, model: data.model, dailyLimit: data.dailyLimit },
      connection,
    );
    return getTryOnSettings({ connection });
  });
}

export function tryOnProductDto(product, configuration) {
  const colors = jsonValue(product.colors_json, []);
  const colorImages = jsonValue(configuration?.color_images_json, {});
  const enabled = !!configuration?.enabled;
  return {
    enabled,
    ready: enabled && colors.length > 0 && colors.every((color) => !!colorImages[color.id]),
    colorImages,
    revision: hash(
      JSON.stringify([
        configuration?.updated_at ?? "",
        colorImages,
        colors,
        product.style_json,
        product.gender,
        product.category,
        product.image_url,
      ]),
    ),
  };
}
export async function getProductTryOn(id, connection) {
  const product = (await query("SELECT * FROM products WHERE id=?", [id], connection))[0];
  if (!product) throw notFound("That product was not found.");
  const row = (await query("SELECT * FROM product_tryon WHERE product_id=?", [id], connection))[0];
  return tryOnProductDto(product, row);
}
export async function updateProductTryOn(id, raw, actor) {
  const data = z
    .object({ enabled: z.boolean(), colorImages: z.record(localImage) })
    .strict()
    .parse(raw);
  if (Object.keys(data.colorImages).length > 30)
    throw invalid("Use one source photo per product colour.");
  await Promise.all(Object.values(data.colorImages).map(readTryOnSource));
  return withTransaction(async (connection) => {
    const product = (
      await query("SELECT * FROM products WHERE id=? FOR UPDATE", [id], connection)
    )[0];
    if (!product) throw notFound("That product was not found.");
    const colors = jsonValue(product.colors_json, []);
    if (Object.keys(data.colorImages).some((id) => !colors.some((color) => color.id === id)))
      throw invalid("Use only this product's current colour IDs.");
    if (data.enabled && !colors.every((color) => data.colorImages[color.id]))
      throw invalid(
        "Upload a clear product photo for every colour before enabling its fitting-room preview.",
      );
    await query(
      "INSERT INTO product_tryon (product_id,enabled,color_images_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),color_images_json=VALUES(color_images_json),updated_at=UTC_TIMESTAMP(3)",
      [id, data.enabled ? 1 : 0, JSON.stringify(data.colorImages)],
      connection,
    );
    await audit(
      actor,
      "tryon.product.updated",
      "product",
      id,
      { enabled: data.enabled, colors: Object.keys(data.colorImages) },
      connection,
    );
    return getProductTryOn(id, connection);
  });
}

const selection = z
  .object({
    productId: z.string().min(1).max(128),
    colorId: z.string().min(1).max(128),
    size: z.string().min(1).max(30),
  })
  .strict();
const previewSchema = z
  .object({
    gender: z.enum(["men", "women"]),
    outfit: z.object({ top: selection, bottom: selection, shoes: selection }).strict(),
    retry: z.boolean().optional().default(false),
    generate: z.boolean().optional().default(true),
  })
  .strict();

async function describeOutfit(input) {
  const data = previewSchema.parse(input);
  const settings = await getTryOnSettings();
  const products = [];
  const references = [];
  let allPrepared = true;
  for (const slot of SLOTS) {
    const selected = data.outfit[slot];
    const product = (
      await query("SELECT * FROM products WHERE id=? AND active=1", [selected.productId])
    )[0];
    const color = jsonValue(product?.colors_json, []).find(
      (color) => color.id === selected.colorId,
    );
    const sizes = jsonValue(product?.sizes_json, []);
    if (
      !product ||
      product.gender !== data.gender ||
      slotFor(product.category) !== slot ||
      !color ||
      !sizes.includes(selected.size)
    )
      throw invalid("Choose an available product, colour and size for each part of the outfit.");
    const row = (await query("SELECT * FROM product_tryon WHERE product_id=?", [product.id]))[0];
    const dynamic = tryOnProductDto(product, row);
    const prepared = !!product.studio_supported && !dynamic.enabled;
    allPrepared &&= prepared;
    const imagePath = prepared
      ? `/images/products/${product.id}--${color.id}.webp`
      : dynamic.enabled
        ? dynamic.colorImages[color.id]
        : null;
    if (!imagePath)
      return {
        unavailable: "This product needs its fitting-room photos to be set up by the store.",
        data,
      };
    products.push({
      id: product.id,
      gender: product.gender,
      category: product.category,
      colors: jsonValue(product.colors_json, []),
      sizes,
      style: jsonValue(product.style_json, {}),
      revision: dynamic.revision,
      name: product.name,
    });
    references.push({ role: slot, imagePath, name: product.name, color: color.name });
  }
  const staticKey = `${data.gender}/${SLOTS.map((slot) => `${data.outfit[slot].productId}--${data.outfit[slot].colorId}`).join("__")}`;
  if (allPrepared) {
    try {
      await stat(path.join(PUBLIC_ROOT, "images/looks", `${staticKey}.webp`));
      return {
        static: { key: staticKey, status: "ready", imageUrl: `/images/looks/${staticKey}.webp` },
        data,
      };
    } catch {
      /* Missing prepared combinations may still be generated from valid references. */
    }
  }
  const model = {
    role: "model",
    imagePath: settings.modelImages[data.gender],
    name: data.gender === "men" ? "Adult male model" : "Adult female model",
    color: "",
  };
  const sources = await Promise.all(
    [model, ...references].map(async (source) => {
      const image = await readTryOnSource(source.imagePath);
      return { ...source, digest: image.digest, dataUrl: image.dataUrl };
    }),
  );
  const key = hash(
    JSON.stringify({
      version: 1,
      gender: data.gender,
      products,
      selections: SLOTS.map((slot) => ({
        productId: data.outfit[slot].productId,
        colorId: data.outfit[slot].colorId,
      })),
      model: settings.model,
      sources: sources.map(({ dataUrl, ...source }) => source),
    }),
  );
  return { data, settings, key, sources };
}
const publicJob = (row) => ({
  id: row.id,
  jobId: row.id,
  key: row.cache_key,
  gender: row.gender,
  status: row.status,
  ...(row.status === "ready" && row.image_url ? { imageUrl: row.image_url } : {}),
  ...(row.error_message ? { message: row.error_message } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
export async function requestTryOnPreview(raw) {
  const description = await describeOutfit(raw);
  if (description.static) return description.static;
  if (description.unavailable)
    return { key: "", status: "unavailable", message: description.unavailable };
  const { data, settings, key, sources } = description;
  return withTransaction(async (connection) => {
    // The shared day row serializes enqueue and retry cost reservations across processes.
    await query(
      "INSERT INTO tryon_usage (usage_day,generation_count) VALUES (UTC_DATE(),0) ON DUPLICATE KEY UPDATE usage_day=VALUES(usage_day)",
      [],
      connection,
    );
    const usage = (
      await query("SELECT * FROM tryon_usage WHERE usage_day=UTC_DATE() FOR UPDATE", [], connection)
    )[0];
    const prior = (
      await query("SELECT * FROM tryon_jobs WHERE cache_key=? FOR UPDATE", [key], connection)
    )[0];
    if (prior && (prior.status !== "failed" || !data.retry)) return publicJob(prior);
    if (!data.generate)
      return {
        key,
        status: "unavailable",
        message: "Open this look in the fitting room to create its preview.",
      };
    if (!settings.enabled || !settings.configured)
      return {
        key,
        status: "unavailable",
        message:
          "AI fitting-room previews are awaiting the store's service setup. You can still shop this product.",
      };
    if (Number(usage.generation_count) >= settings.dailyLimit)
      return {
        key,
        status: "unavailable",
        message: "The store's daily preview limit has been reached. Please try again tomorrow.",
      };
    await query(
      "UPDATE tryon_usage SET generation_count=generation_count+1 WHERE usage_day=UTC_DATE()",
      [],
      connection,
    );
    const id = prior?.id ?? randomUUID();
    const sourceMetadata = sources.map(({ dataUrl, ...source }) => source);
    if (prior)
      await query(
        "UPDATE tryon_jobs SET status='pending',error_code=NULL,error_message=NULL,outfit_json=?,sources_json=?,attempts=attempts+1,lease_token=NULL,started_at=NULL,finished_at=NULL WHERE id=?",
        [JSON.stringify(data), JSON.stringify(sourceMetadata), id],
        connection,
      );
    else
      await query(
        "INSERT INTO tryon_jobs (id,cache_key,gender,outfit_json,sources_json,status,attempts) VALUES (?,?,?,?,?,'pending',1)",
        [id, key, data.gender, JSON.stringify(data), JSON.stringify(sourceMetadata)],
        connection,
      );
    return publicJob((await query("SELECT * FROM tryon_jobs WHERE id=?", [id], connection))[0]);
  });
}
export async function getTryOnJob(id) {
  z.string().uuid().parse(id);
  const row = (await query("SELECT * FROM tryon_jobs WHERE id=?", [id]))[0];
  if (!row) throw notFound("That preview was not found.");
  try {
    const description = await describeOutfit(jsonValue(row.outfit_json, {}));
    if (description.key !== row.cache_key)
      return {
        key: row.cache_key,
        status: "unavailable",
        message: "This product has changed. Select the outfit again to create an updated preview.",
      };
  } catch {
    return {
      key: row.cache_key,
      status: "unavailable",
      message: "This outfit is no longer available for preview.",
    };
  }
  return publicJob(row);
}
export async function listTryOnJobs() {
  const jobs = await query("SELECT * FROM tryon_jobs ORDER BY created_at DESC LIMIT 100");
  const usage = (
    await query("SELECT generation_count FROM tryon_usage WHERE usage_day=UTC_DATE()")
  )[0];
  return { jobs: jobs.map(publicJob), usedToday: Number(usage?.generation_count ?? 0) };
}

/** Runs one persistent job. The injected generator is used by isolated integration tests only. */
export async function processTryOnJobs({ generateImage = generateTryOnImage, jobId } = {}) {
  const lock = await getPool().getConnection();
  const lockName = `forme-tryon-${hash(config.dbName).slice(0, 32)}`;
  let acquired = false;
  try {
    acquired =
      Number((await query("SELECT GET_LOCK(?,0) AS acquired", [lockName], lock))[0].acquired) === 1;
    if (!acquired) return false;
    await query(
      "UPDATE tryon_jobs SET status='failed',error_code='INTERRUPTED',error_message='Image creation was interrupted. Open the outfit and choose Retry.',lease_token=NULL,finished_at=UTC_TIMESTAMP(3) WHERE status='processing' AND started_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE)",
    );
    const settings = await getTryOnSettings({ includeSecret: true });
    if (!settings.enabled || !settings.configured) return false;
    const lease = randomUUID();
    const row = await withTransaction(async (connection) => {
      await query(
        "INSERT INTO tryon_usage (usage_day,generation_count) VALUES (UTC_DATE(),0) ON DUPLICATE KEY UPDATE usage_day=VALUES(usage_day)",
        [],
        connection,
      );
      const usage = (
        await query(
          "SELECT * FROM tryon_usage WHERE usage_day=UTC_DATE() FOR UPDATE",
          [],
          connection,
        )
      )[0];
      const usedToday = Number(usage.generation_count);
      if (usedToday > settings.dailyLimit) return null;
      // An older job may need a new day's budget. Skip that job when today's
      // remaining slots are already reserved, so it cannot block paid-for jobs.
      const pending = (
        await query(
          `SELECT *,DATE(updated_at)=UTC_DATE() AS reserved_today FROM tryon_jobs WHERE status='pending' ${jobId ? "AND id=?" : ""} AND (DATE(updated_at)=UTC_DATE() OR ?<?) ORDER BY created_at,id LIMIT 1 FOR UPDATE`,
          [...(jobId ? [z.string().uuid().parse(jobId)] : []), usedToday, settings.dailyLimit],
          connection,
        )
      )[0];
      if (!pending) return null;
      // Pending jobs carried across midnight must reserve today's budget too.
      if (!pending.reserved_today) {
        await query(
          "UPDATE tryon_usage SET generation_count=generation_count+1 WHERE usage_day=UTC_DATE()",
          [],
          connection,
        );
      }
      await query(
        "UPDATE tryon_jobs SET status='processing',lease_token=?,started_at=UTC_TIMESTAMP(3) WHERE id=? AND status='pending'",
        [lease, pending.id],
        connection,
      );
      return pending;
    });
    if (!row) return false;
    try {
      const description = await describeOutfit(jsonValue(row.outfit_json, {}));
      if (description.key !== row.cache_key)
        throw new ApiError(
          409,
          "SOURCE_CHANGED",
          "A product photo changed. Select the outfit again to create a current preview.",
        );
      const result = await generateImage({
        apiKey: settings.apiKey,
        model: settings.model,
        gender: row.gender,
        referenceImages: description.sources.map(({ role, dataUrl, name, color }) => ({
          role,
          dataUrl,
          name,
          color,
        })),
      });
      if (
        !Buffer.isBuffer(result?.buffer) ||
        result.buffer.length < 12 ||
        result.buffer.length > MAX_OUTPUT_BYTES
      )
        throw new Error("INVALID_IMAGE");
      const image = sharp(result.buffer, { limitInputPixels: 16_777_216 });
      const metadata = await image.metadata();
      if (
        !["png", "jpeg", "webp"].includes(metadata.format) ||
        (metadata.pages ?? 1) > 1 ||
        !metadata.width ||
        !metadata.height
      )
        throw new Error("INVALID_IMAGE");
      const buffer = await image
        .rotate()
        .resize(680, 1000, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90 })
        .toBuffer();
      // Recheck revisions after generation so an edited product cannot publish a stale frame.
      const current = await describeOutfit(jsonValue(row.outfit_json, {}));
      if (current.key !== row.cache_key)
        throw new ApiError(
          409,
          "SOURCE_CHANGED",
          "A product photo changed during image creation. Select the outfit again.",
        );
      const name = `${row.cache_key}-${lease}.webp`;
      const directory = path.join(config.uploadDir, "try-on");
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, name), buffer, { flag: "wx" });
      await query(
        "UPDATE tryon_jobs SET status='ready',image_url=?,error_code=NULL,error_message=NULL,finished_at=UTC_TIMESTAMP(3),lease_token=NULL WHERE id=? AND lease_token=? AND status='processing'",
        [`/uploads/try-on/${name}`, row.id, lease],
      );
    } catch (error) {
      const known = error instanceof ApiError && error.code === "SOURCE_CHANGED";
      await query(
        "UPDATE tryon_jobs SET status='failed',error_code=?,error_message=?,finished_at=UTC_TIMESTAMP(3),lease_token=NULL WHERE id=? AND lease_token=?",
        [
          known ? "SOURCE_CHANGED" : "GENERATION_FAILED",
          known
            ? error.message
            : "The preview could not be created. Please retry or contact the store.",
          row.id,
          lease,
        ],
      );
    }
    return true;
  } finally {
    if (acquired) await query("SELECT RELEASE_LOCK(?)", [lockName], lock).catch(() => undefined);
    lock.release();
  }
}
let workerTimer;
let workerRunning = false;
export function startTryOnWorker() {
  if (workerTimer) return;
  const tick = async () => {
    if (workerRunning) return;
    workerRunning = true;
    try {
      await processTryOnJobs();
    } catch (error) {
      console.error(JSON.stringify({ task: "tryon_worker", code: error?.code || "WORKER_FAILED" }));
    } finally {
      workerRunning = false;
    }
  };
  workerTimer = setInterval(tick, 1500);
  workerTimer.unref();
  void tick();
}
export function stopTryOnWorker() {
  clearInterval(workerTimer);
  workerTimer = undefined;
}
