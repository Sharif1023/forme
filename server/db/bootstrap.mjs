import "dotenv/config";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getPool, query, withTransaction, closePool } from "./pool.mjs";
import { hashPassword } from "../security.mjs";

export async function initializeSchema() {
  const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  for (const statement of sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((part) => part.trim())
    .filter(Boolean))
    await query(statement);
}

export async function seedCatalog() {
  const data = JSON.parse(await readFile(new URL("./catalog-seed.json", import.meta.url), "utf8"));
  const products = Array.isArray(data) ? data : data.products;
  if (!Array.isArray(products) || products.length === 0)
    throw new Error("catalog-seed.json must contain products.");
  await withTransaction(async (connection) => {
    for (const product of products) {
      const sizes =
        product.sizes ||
        (product.category === "shoes"
          ? product.gender === "men"
            ? ["7", "8", "9", "10", "11", "12"]
            : ["5", "6", "7", "8", "9", "10"]
          : ["S", "M", "L", "XL"]);
      const price = product.pricePaise;
      if (!Number.isSafeInteger(price) || price < 0)
        throw new Error(`Invalid seed price for ${product.id}`);
      await query(
        "INSERT IGNORE INTO products (id,name,gender,category,description,price_paise,image_url,style_json,colors_json,sizes_json,active,studio_supported) VALUES (?,?,?,?,?,?,?,?,?,?,1,1)",
        [
          product.id,
          product.name,
          product.gender,
          product.category,
          product.description || "",
          price,
          product.imageUrl || "",
          JSON.stringify(product.style || {}),
          JSON.stringify(product.colors),
          JSON.stringify(sizes),
        ],
        connection,
      );
      const explicit =
        data.variants?.filter((variant) => variant.productId === product.id) || product.variants;
      const variants = explicit?.length
        ? explicit
        : product.colors.flatMap((color) =>
            sizes.map((size) => ({
              id: `${product.id}--${color.id}--${size}`,
              productId: product.id,
              colorId: color.id,
              colorName: color.name,
              hex: color.hex,
              size,
              sku: `${product.id}-${color.id}-${size}`.toUpperCase(),
              pricePaise: price,
              stock: 25,
            })),
          );
      for (const variant of variants) {
        const color = product.colors.find((choice) => choice.id === variant.colorId);
        await query(
          "INSERT IGNORE INTO variants (id,product_id,color_id,color_name,hex,size,sku,price_paise,stock,reserved,active) VALUES (?,?,?,?,?,?,?,?,?,0,1)",
          [
            variant.id || `${product.id}--${variant.colorId}--${variant.size}`,
            product.id,
            variant.colorId,
            variant.colorName || color?.name || variant.colorId,
            variant.hex || color?.hex || "#888888",
            String(variant.size),
            variant.sku || `${product.id}-${variant.colorId}-${variant.size}`.toUpperCase(),
            variant.pricePaise ?? price,
            variant.stock ?? 25,
          ],
          connection,
        );
      }
    }
  });
  return products.length;
}

export async function bootstrapOwner() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 200)
    throw new Error("ADMIN_EMAIL must be valid and ADMIN_PASSWORD must contain 12–200 characters.");
  const owners = await query("SELECT id FROM admin_users WHERE role='owner' AND active=1 LIMIT 1");
  if (owners.length) return false;
  await query(
    "INSERT INTO admin_users (id,name,email,password_hash,role,active) VALUES (?,?,?,?, 'owner',1)",
    [randomUUID(), process.env.ADMIN_NAME || "Store owner", email, await hashPassword(password)],
  );
  return true;
}

export async function bootstrap() {
  await initializeSchema();
  const count = await seedCatalog();
  const created = await bootstrapOwner();
  return { products: count, ownerCreated: created };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  bootstrap()
    .then((result) =>
      console.log(
        `Database ready. Catalog products: ${result.products}. Owner ${result.ownerCreated ? "created" : "already exists or ADMIN_EMAIL/ADMIN_PASSWORD not supplied"}.`,
      ),
    )
    .catch((error) => {
      console.error(
        `Database setup failed: ${error.code || "SETUP_ERROR"}. Check the database configuration and bootstrap inputs.`,
      );
      process.exitCode = 1;
    })
    .finally(closePool);
}
