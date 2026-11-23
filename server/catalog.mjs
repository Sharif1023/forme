import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, withTransaction } from "./db/pool.mjs";
import { audit, jsonValue } from "./audit.mjs";
import { conflict, invalid, notFound } from "./errors.mjs";
import { tryOnProductDto } from "./tryon.mjs";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const colorSchema = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(100),
  hex: z.string().regex(/^#[a-fA-F0-9]{6}$/),
});
const imageUrl = z
  .string()
  .max(1024)
  .refine(
    (value) =>
      !value || (value.startsWith("/") && !value.startsWith("//")) || /^https:\/\//.test(value),
    "Use a shop image path or HTTPS image URL.",
  );
const productSchema = z.object({
  id: identifier.optional(),
  name: z.string().trim().min(1).max(180),
  gender: z.enum(["men", "women"]),
  category: z.enum(["tshirts", "shirts", "pants", "shoes"]),
  description: z.string().max(10000).default(""),
  pricePaise: z.number().int().min(1).max(1000000000),
  active: z.boolean().default(true),
  imageUrl: imageUrl.nullable().optional(),
  colors: z.array(colorSchema).min(1).max(30),
  sizes: z.array(z.string().trim().min(1).max(30)).min(1).max(30),
  style: z.record(z.unknown()).optional(),
});
const stableJson = (value) => JSON.stringify(value, Object.keys(value || {}).sort());
const keepsPreparedPreview = (prior, data) => {
  if (!prior?.studio_supported || prior.gender !== data.gender || prior.category !== data.category)
    return false;
  const prepared = jsonValue(prior.colors_json, []);
  const sameColours = data.colors.every((color) =>
    prepared.some(
      (original) =>
        original.id === color.id && original.hex.toLowerCase() === color.hex.toLowerCase(),
    ),
  );
  return (
    sameColours && stableJson(jsonValue(prior.style_json, {})) === stableJson(data.style || {})
  );
};
export const productDto = (row) => ({
  id: row.id,
  name: row.name,
  gender: row.gender,
  category: row.category,
  description: row.description,
  pricePaise: Number(row.price_paise),
  price: Number(row.price_paise) / 100,
  active: !!row.active,
  imageUrl:
    row.studio_supported && row.image_url?.startsWith(`/images/products/${row.id}--`)
      ? null
      : row.image_url || null,
  colors: jsonValue(row.colors_json, []),
  sizes: jsonValue(row.sizes_json, []),
  style: jsonValue(row.style_json, {}),
  studioSupported: !!row.studio_supported,
  previewSupported: !!row.studio_supported && !row.tryon_enabled,
  tryOn: tryOnProductDto(row, {
    enabled: row.tryon_enabled,
    color_images_json: row.tryon_color_images,
    updated_at: row.tryon_updated_at,
  }),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
export const variantDto = (row) => ({
  id: row.id,
  productId: row.product_id,
  colorId: row.color_id,
  colorName: row.color_name,
  hex: row.hex,
  size: row.size,
  sku: row.sku,
  pricePaise: Number(row.price_paise),
  stock: Number(row.stock),
  reserved: Number(row.reserved),
  available: Number(row.stock) - Number(row.reserved),
  active: !!row.active,
  productName: row.product_name,
});

export async function getCatalog({ admin = false, connection } = {}) {
  const products = await query(
    `SELECT p.*,t.enabled AS tryon_enabled,t.color_images_json AS tryon_color_images,t.updated_at AS tryon_updated_at FROM products p LEFT JOIN product_tryon t ON t.product_id=p.id ${admin ? "" : "WHERE p.active=1"} ORDER BY p.created_at,p.id`,
    [],
    connection,
  );
  const variants = await query(
    `SELECT v.*,p.name AS product_name FROM variants v JOIN products p ON p.id=v.product_id ${admin ? "" : "WHERE v.active=1 AND p.active=1"} ORDER BY v.product_id,v.color_id,v.size`,
    [],
    connection,
  );
  return {
    products: products.map(productDto),
    variants: variants.map((row) => {
      const dto = variantDto(row);
      return admin ? dto : { ...dto, inventoryStock: dto.stock, stock: dto.available };
    }),
    currency: "BDT",
  };
}
export async function saveProduct(raw, id, actor) {
  const prior = id ? (await query("SELECT * FROM products WHERE id=?", [id]))[0] : null;
  if (id && !prior) throw notFound("That product was not found.");
  const data = productSchema.parse(prior ? { ...productDto(prior), ...raw, id } : raw);
  if (
    new Set(data.colors.map((color) => color.id)).size !== data.colors.length ||
    new Set(data.sizes).size !== data.sizes.length
  )
    throw invalid("Colour IDs and sizes must be unique.");
  const productId = id || data.id || `product-${randomUUID()}`;
  return withTransaction(async (connection) => {
    if (prior) {
      await query("SELECT id FROM products WHERE id=? FOR UPDATE", [id], connection);
      await query(
        "UPDATE products SET name=?,gender=?,category=?,description=?,price_paise=?,image_url=?,style_json=?,colors_json=?,sizes_json=?,active=?,studio_supported=IF(studio_supported=1,?,0) WHERE id=?",
        [
          data.name,
          data.gender,
          data.category,
          data.description,
          data.pricePaise,
          data.imageUrl || "",
          JSON.stringify(data.style || {}),
          JSON.stringify(data.colors),
          JSON.stringify(data.sizes),
          data.active ? 1 : 0,
          keepsPreparedPreview(prior, data) ? 1 : 0,
          id,
        ],
        connection,
      );
      await query("UPDATE variants SET active=0 WHERE product_id=?", [id], connection);
    } else {
      await query(
        "INSERT INTO products (id,name,gender,category,description,price_paise,image_url,style_json,colors_json,sizes_json,active,studio_supported) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)",
        [
          productId,
          data.name,
          data.gender,
          data.category,
          data.description,
          data.pricePaise,
          data.imageUrl || "",
          JSON.stringify(data.style || {}),
          JSON.stringify(data.colors),
          JSON.stringify(data.sizes),
          data.active ? 1 : 0,
        ],
        connection,
      );
    }
    for (const color of data.colors)
      for (const size of data.sizes) {
        const variantId = `${productId}:${color.id}:${size}`;
        await query(
          "INSERT INTO variants (id,product_id,color_id,color_name,hex,size,sku,price_paise,stock,reserved,active) VALUES (?,?,?,?,?,?,?,?,0,0,?) ON DUPLICATE KEY UPDATE color_name=VALUES(color_name),hex=VALUES(hex),price_paise=VALUES(price_paise),active=VALUES(active)",
          [
            variantId,
            productId,
            color.id,
            color.name,
            color.hex,
            size,
            variantId.toUpperCase(),
            data.pricePaise,
            data.active ? 1 : 0,
          ],
          connection,
        );
      }
    await audit(
      actor,
      prior ? "product.updated" : "product.created",
      "product",
      productId,
      { name: data.name },
      connection,
    );
    return {
      product: productDto(
        (await query("SELECT * FROM products WHERE id=?", [productId], connection))[0],
      ),
      variants: (
        await query("SELECT * FROM variants WHERE product_id=?", [productId], connection)
      ).map(variantDto),
    };
  });
}
export async function archiveProduct(id, actor) {
  return withTransaction(async (connection) => {
    const product = (
      await query("SELECT id FROM products WHERE id=? FOR UPDATE", [id], connection)
    )[0];
    if (!product) throw notFound();
    await query("UPDATE products SET active=0 WHERE id=?", [id], connection);
    await query("UPDATE variants SET active=0 WHERE product_id=?", [id], connection);
    await audit(actor, "product.archived", "product", id, {}, connection);
    return { archived: true };
  });
}
export async function updateInventory(id, raw, actor) {
  const data = z
    .object({
      stock: z.number().int().min(0).max(10000000).optional(),
      pricePaise: z.number().int().min(1).max(1000000000).optional(),
      active: z.boolean().optional(),
      sku: z.string().trim().min(1).max(180).optional(),
    })
    .strict()
    .parse(raw);
  if (!Object.keys(data).length) throw invalid("Choose an inventory field to update.");
  return withTransaction(async (connection) => {
    const row = (await query("SELECT * FROM variants WHERE id=? FOR UPDATE", [id], connection))[0];
    if (!row) throw notFound("That variant was not found.");
    if (data.stock !== undefined && data.stock < row.reserved)
      throw conflict(`At least ${row.reserved} items are reserved for existing orders.`);
    await query(
      "UPDATE variants SET stock=?,price_paise=?,active=?,sku=? WHERE id=?",
      [
        data.stock ?? row.stock,
        data.pricePaise ?? Number(row.price_paise),
        data.active === undefined ? row.active : data.active ? 1 : 0,
        data.sku ?? row.sku,
        id,
      ],
      connection,
    );
    await audit(actor, "inventory.updated", "variant", id, data, connection);
    return {
      variant: variantDto((await query("SELECT * FROM variants WHERE id=?", [id], connection))[0]),
    };
  });
}
