import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PRODUCTS, categoryToSlot } from "../src/lib/forme/catalog.ts";
import { outfitImageKey } from "../src/lib/forme/outfit-key.ts";
import { findShoeBoundaries } from "./outfit-footwear.mjs";

// All source photographs contain COMPLETE outfits. This script only extracts
// whole frames and prepares their colours; it never combines body/garment parts.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const force = process.argv.includes("--force");
const forceTop = process.argv.find((argument) => argument.startsWith("--force-top="))?.slice(12);
const availableOnly = process.argv.includes("--available");
sharp.concurrency(2);

const MATRIX = {
  men: {
    pants: ["m-pant-chino", "m-pant-pleat", "m-pant-denim"],
    shoes: ["m-shoe-sneaker", "m-shoe-loafer", "m-shoe-chelsea"],
  },
  women: {
    pants: ["w-pant-wide", "w-pant-jean", "w-pant-cigarette"],
    shoes: ["w-shoe-sneaker", "w-shoe-pump", "w-shoe-boot"],
  },
};
const byId = new Map(PRODUCTS.map((product) => [product.id, product]));
const exists = async (file) => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};
const rgb = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
const neutral = (data, offset) =>
  data[offset + 3] > 60 &&
  !(data[offset] - data[offset + 2] > 19 && data[offset] > data[offset + 1] * 1.055);
const luma = (data, offset) =>
  data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;

function centralFabricBounds(data, width, y, bounds) {
  const center = bounds.left + bounds.width / 2;
  const runs = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const fabric = x < width && neutral(data, (y * width + x) * 4);
    if (fabric && start < 0) start = x;
    if (!fabric && start >= 0) {
      if (x - start > 3 && start < center + bounds.width * 0.2 && x > center - bounds.width * 0.2)
        runs.push([start, x - 1]);
      start = -1;
    }
  }
  return runs.length
    ? {
        left: Math.min(...runs.map((run) => run[0])),
        right: Math.max(...runs.map((run) => run[1])),
      }
    : null;
}

function waistLine(data, width, height, gender) {
  const values = new Float32Array(height);
  for (let y = Math.floor(height * 0.31); y < height * 0.53; y++) {
    let total = 0,
      count = 0;
    for (let x = Math.floor(width * 0.43); x < width * 0.57; x++) {
      const offset = (y * width + x) * 4;
      if (neutral(data, offset)) {
        total += luma(data, offset);
        count++;
      }
    }
    values[y] = count ? total / count : 0;
  }
  let bestY = Math.round(height * (gender === "men" ? 0.44 : 0.4));
  let bestScore = 0;
  for (
    let y = Math.floor(height * (gender === "men" ? 0.37 : 0.33));
    y < height * (gender === "men" ? 0.5 : 0.47);
    y++
  ) {
    let before = 0,
      after = 0;
    for (let delta = 1; delta <= 4; delta++) {
      before += values[y - delta];
      after += values[y + delta];
    }
    const score = (before - after) / 4;
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }
  return bestY;
}

function materialMasks(data, width, height, gender, row, column, product, bounds) {
  const waist = waistLine(data, width, height, gender);
  const footwear = findShoeBoundaries(data, width, height, bounds, { gender, row, column });
  const ankle = Math.min(footwear.left, footwear.right);
  const longSleeves = product.style.kind === "shirt" && product.style.sleeve === "long";
  const waistSides = longSleeves ? centralFabricBounds(data, width, waist + 3, bounds) : null;
  if (waistSides) {
    const center = bounds.left + bounds.width / 2;
    const halfWaist = bounds.width * (gender === "women" ? 0.24 : 0.31);
    waistSides.left = Math.max(waistSides.left, Math.floor(center - halfWaist));
    waistSides.right = Math.min(waistSides.right, Math.ceil(center + halfWaist));
  }
  const hipY = Math.round(bounds.top + bounds.height * 0.6);
  const hipSides = longSleeves ? centralFabricBounds(data, width, hipY, bounds) : null;
  const masks = [[], [], []];
  const samples = [[], [], []];
  // Measure trouser sides below the wrists, where touching cuffs cannot merge
  // with the trousers. Both legs are included even when the central gap is open.
  let pantsLeft = width,
    pantsRight = 0;
  for (let y = Math.floor(height * 0.625); y < height * 0.71; y++) {
    for (let x = Math.floor(width * 0.2); x < width * 0.8; x++) {
      if (neutral(data, (y * width + x) * 4)) {
        pantsLeft = Math.min(pantsLeft, x);
        pantsRight = Math.max(pantsRight, x);
      }
    }
  }
  pantsLeft -= 1;
  pantsRight += 1;
  for (let y = Math.floor(height * 0.17); y < height; y++) {
    // Below the waist, the central neutral component is trousers. Separate side
    // components are shirt sleeves; warm skin and transparent gaps stay intact.
    let rowPantsLeft = pantsLeft;
    let rowPantsRight = pantsRight;
    const cuffEnd = longSleeves ? bounds.top + bounds.height * 0.55 : waist;
    if (longSleeves && y >= waist && y < cuffEnd) {
      // The wide-leg outline below the hands is wider than the waistband. Trace
      // the central trouser runs on each row so both separate sleeves stay shirts.
      const sides = centralFabricBounds(data, width, y, bounds);
      if (sides) {
        rowPantsLeft = sides.left;
        rowPantsRight = sides.right;
      }
      if (waistSides && hipSides) {
        // A touching sleeve can join the central fabric run. Clamp that run to
        // the natural waistband-to-hip outline rather than swallowing the cuff.
        const progress = Math.sqrt(Math.min(1, Math.max(0, (y - waist) / (hipY - waist))));
        rowPantsLeft = Math.max(
          rowPantsLeft,
          Math.floor(waistSides.left + (hipSides.left - waistSides.left) * progress) - 1,
        );
        rowPantsRight = Math.min(
          rowPantsRight,
          Math.ceil(waistSides.right + (hipSides.right - waistSides.right) * progress) + 1,
        );
      }
    }
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (!neutral(data, offset)) continue;
      const slot =
        y >= (x < footwear.center ? footwear.left : footwear.right)
          ? 2
          : y < waist || (y < cuffEnd && (x < rowPantsLeft || x > rowPantsRight))
            ? 0
            : 1;
      masks[slot].push(offset);
      const luminance = luma(data, offset);
      if (luminance > 60 && luminance < 245) samples[slot].push(luminance);
    }
  }
  const references = samples.map((sample, index) => {
    sample.sort((a, b) => a - b);
    return sample[Math.floor(sample.length * 0.6)] ?? [190, 150, 180][index];
  });
  return { masks, references, waist, ankle };
}

function personBounds(data, width, height) {
  let left = width,
    right = 0,
    top = height,
    bottom = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 80) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function colourFrame(original, masks, references, colours) {
  const output = Buffer.from(original);
  for (let slot = 0; slot < 3; slot++) {
    const target = rgb(colours[slot].hex);
    for (const offset of masks[slot]) {
      const luminance = luma(original, offset);
      const shade = luminance / references[slot];
      const highlight = Math.max(0, luminance - references[slot]) * 0.12;
      for (let channel = 0; channel < 3; channel++)
        output[offset + channel] = Math.min(
          255,
          Math.max(0, Math.round(target[channel] * shade + highlight)),
        );
    }
  }
  return output;
}

const coverage = [];
const registrations = [];
let written = 0;
for (const gender of ["men", "women"]) {
  const outputDir = path.join(publicRoot, "images", "looks", gender);
  await mkdir(outputDir, { recursive: true });
  const tops = PRODUCTS.filter(
    (product) => product.gender === gender && categoryToSlot(product.category) === "top",
  );
  for (const top of tops) {
    const source = path.join(publicRoot, "images", "outfits", `${top.id}-matrix.png`);
    if (!(await exists(source))) {
      if (availableOnly) continue;
      throw new Error(`Missing complete-outfit master: ${source}`);
    }
    const atlas = await readFile(source);
    const metadata = await sharp(atlas).metadata();
    for (let row = 0; row < 3; row++)
      for (let column = 0; column < 3; column++) {
        const bottom = byId.get(MATRIX[gender].pants[row]);
        const shoes = byId.get(MATRIX[gender].shoes[column]);
        const left = Math.floor((column * metadata.width) / 3),
          topY = Math.floor((row * metadata.height) / 3);
        const width = Math.floor(((column + 1) * metadata.width) / 3) - left;
        const height = Math.floor(((row + 1) * metadata.height) / 3) - topY;
        const { data, info } = await sharp(atlas)
          .extract({ left, top: topY, width, height })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const bounds = personBounds(data, width, height);
        const { masks, references, waist, ankle } = materialMasks(
          data,
          width,
          height,
          gender,
          row,
          column,
          top,
          bounds,
        );
        registrations.push({
          top: top.id,
          bottom: bottom.id,
          shoes: shoes.id,
          width,
          height,
          waist,
          ankle,
        });
        const tasks = [];
        for (const topColour of top.colors)
          for (const bottomColour of bottom.colors)
            for (const shoeColour of shoes.colors) {
              const outfit = {
                top: { productId: top.id, colorId: topColour.id },
                bottom: { productId: bottom.id, colorId: bottomColour.id },
                shoes: { productId: shoes.id, colorId: shoeColour.id },
              };
              const key = outfitImageKey(gender, outfit);
              coverage.push(key);
              const output = path.join(publicRoot, "images", "looks", `${key}.webp`);
              if (!force && forceTop !== top.id && (await exists(output))) continue;
              tasks.push(async () => {
                const pixels = colourFrame(data, masks, references, [
                  topColour,
                  bottomColour,
                  shoeColour,
                ]);
                await sharp(pixels, {
                  raw: { width: info.width, height: info.height, channels: 4 },
                })
                  .extract(bounds)
                  .resize(310, 480, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
                  .extend({
                    top: 16,
                    bottom: 16,
                    left: 16,
                    right: 16,
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                  })
                  .webp({ quality: 87, alphaQuality: 100, effort: 3 })
                  .toFile(output);
                written++;
              });
            }
        for (let index = 0; index < tasks.length; index += 4)
          await Promise.all(tasks.slice(index, index + 4).map((task) => task()));
      }
    console.log(`Prepared ${top.id}: 243 exact combinations`);
  }
}

// Separate men's/women's product photographs, with each selected colour already
// rendered. A pump can never resolve to a men's loafer or shared generic sprite.
const productDir = path.join(publicRoot, "images", "products");
await mkdir(productDir, { recursive: true });
const productFrames = {
  men: [
    "m-tee-crew",
    "m-tee-pocket",
    "m-tee-v",
    "m-shirt-oxford",
    "m-shirt-camp",
    "m-shirt-band",
    "m-pant-chino",
    "m-pant-pleat",
    "m-pant-denim",
    "m-shoe-sneaker",
    "m-shoe-loafer",
    "m-shoe-chelsea",
  ],
  women: [
    "w-tee-crew",
    "w-tee-boxy",
    "w-tee-v",
    "w-shirt-poplin",
    "w-shirt-camp",
    "w-shirt-band",
    "w-pant-wide",
    "w-pant-jean",
    "w-pant-cigarette",
    "w-shoe-sneaker",
    "w-shoe-pump",
    "w-shoe-boot",
  ],
};
for (const gender of ["men", "women"]) {
  const source = path.join(publicRoot, "images", `products-${gender}-source.png`);
  if (!(await exists(source))) {
    if (availableOnly) continue;
    throw new Error(`Missing product photographs: ${source}`);
  }
  const atlas = await readFile(source);
  const metadata = await sharp(atlas).metadata();
  for (const [index, id] of productFrames[gender].entries()) {
    const product = byId.get(id);
    const column = index % 4,
      row = Math.floor(index / 4);
    const left = Math.floor((column * metadata.width) / 4),
      top = Math.floor((row * metadata.height) / 3);
    const width = Math.floor(((column + 1) * metadata.width) / 4) - left,
      height = Math.floor(((row + 1) * metadata.height) / 3) - top;
    const { data, info } = await sharp(atlas)
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const offsets = [],
      samples = [];
    for (let offset = 0; offset < data.length; offset += 4)
      if (data[offset + 3] > 8) {
        offsets.push(offset);
        samples.push(luma(data, offset));
      }
    samples.sort((a, b) => a - b);
    const reference = samples[Math.floor(samples.length * 0.6)] || 180;
    for (const colour of product.colors) {
      const output = path.join(productDir, `${id}--${colour.id}.webp`);
      if (!force && (await exists(output))) continue;
      const pixels = colourFrame(
        data,
        [offsets, [], []],
        [reference, 1, 1],
        [colour, colour, colour],
      );
      await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
        .trim({ threshold: 8 })
        .resize(320, 400, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 89, alphaQuality: 100 })
        .toFile(output);
    }
  }
}

await writeFile(
  path.join(publicRoot, "images", "looks", "coverage.json"),
  JSON.stringify({ total: coverage.length, keys: coverage, registrations }, null, 2),
);
console.log(`Complete: ${coverage.length} outfit images available; ${written} written this run.`);
