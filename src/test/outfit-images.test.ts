import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Gender } from "@/lib/forme/bodies";
import {
  PRODUCTS,
  categoryToSlot,
  defaultSize,
  getProduct,
  type Product,
} from "@/lib/forme/catalog";
import { getOutfitImage, getProductImage } from "@/lib/forme/outfit-images";
import { DEFAULT_OUTFITS, type Outfit } from "@/lib/forme/state";

const assetPath = (src: string) => path.join(process.cwd(), "public", src.replace(/^\//, ""));

function selection(product: Product, colorId: string) {
  return { productId: product.id, colorId, size: defaultSize(product) };
}

function product(id: string): Product {
  const found = getProduct(id);
  if (!found) throw new Error(`Missing test product: ${id}`);
  return found;
}

describe("Complete photographic outfit coverage", () => {
  it("provides a distinct, nonempty complete image for all 2,916 catalog combinations", () => {
    const keys = new Set<string>();
    const sources = new Set<string>();
    const missing: string[] = [];

    for (const gender of ["men", "women"] as const) {
      const wardrobe = PRODUCTS.filter((piece) => piece.gender === gender);
      const tops = wardrobe.filter((piece) => categoryToSlot(piece.category) === "top");
      const bottoms = wardrobe.filter((piece) => categoryToSlot(piece.category) === "bottom");
      const shoes = wardrobe.filter((piece) => categoryToSlot(piece.category) === "shoes");
      expect([tops.length, bottoms.length, shoes.length]).toEqual([6, 3, 3]);
      expect(wardrobe.every((piece) => piece.colors.length === 3)).toBe(true);

      let count = 0;
      for (const top of tops)
        for (const bottom of bottoms)
          for (const shoe of shoes) {
            for (const topColor of top.colors)
              for (const bottomColor of bottom.colors)
                for (const shoeColor of shoe.colors) {
                  const outfit: Outfit = {
                    top: selection(top, topColor.id),
                    bottom: selection(bottom, bottomColor.id),
                    shoes: selection(shoe, shoeColor.id),
                  };
                  const image = getOutfitImage(gender, outfit);
                  expect(image.src).toBe(`/images/looks/${image.key}.webp`);
                  expect(image.key.startsWith(`${gender}/`)).toBe(true);
                  keys.add(image.key);
                  sources.add(image.src);
                  const file = assetPath(image.src);
                  if (!existsSync(file) || statSync(file).size === 0) missing.push(image.src);
                  count++;
                }
          }
      expect(count).toBe(1458);
    }

    expect(keys.size).toBe(2916);
    expect(sources.size).toBe(2916);
    expect(missing).toEqual([]);
  });

  it.each(["men", "women"] as const)(
    "keeps the %s image unchanged when only sizes change",
    (gender: Gender) => {
      const outfit = structuredClone(DEFAULT_OUTFITS[gender]);
      const original = getOutfitImage(gender, outfit);
      outfit.top.size = "XL";
      outfit.bottom.size = "L";
      outfit.shoes.size = gender === "men" ? "12" : "10";
      expect(getOutfitImage(gender, outfit)).toEqual(original);
    },
  );

  it.each([
    { reason: "unknown colour", top: { productId: "m-tee-crew", colorId: "missing", size: "M" } },
    {
      reason: "cross-model product",
      top: { productId: "w-tee-crew", colorId: "ivory", size: "M" },
    },
    {
      reason: "wrong garment slot",
      top: { productId: "m-pant-chino", colorId: "khaki", size: "M" },
    },
    { reason: "unknown product", top: { productId: "missing", colorId: "ivory", size: "M" } },
  ])("rejects an $reason instead of substituting another photograph", ({ top }) => {
    const outfit = { ...structuredClone(DEFAULT_OUTFITS.men), top };
    expect(() => getOutfitImage("men", outfit)).toThrow("Invalid men outfit selection: top");
  });
});

describe("Gender-specific product photographs", () => {
  it("resolves every selected colour to its own existing product photograph", () => {
    const sources = new Set<string>();
    const missing: string[] = [];
    for (const piece of PRODUCTS)
      for (const color of piece.colors) {
        const src = getProductImage(piece, color.hex);
        expect(src).toBe(`/images/products/${piece.id}--${color.id}.webp`);
        expect(getProductImage(piece, color.hex.toUpperCase())).toBe(src);
        sources.add(src);
        const file = assetPath(src);
        if (!existsSync(file) || statSync(file).size === 0) missing.push(src);
      }
    expect(sources.size).toBe(72);
    expect(missing).toEqual([]);
  });

  it("uses an independent women's pump photograph instead of the men's loafer", () => {
    const pump = product("w-shoe-pump");
    const loafer = product("m-shoe-loafer");
    const pumpImage = getProductImage(pump, pump.colors[0]!.hex);
    const loaferImage = getProductImage(loafer, loafer.colors[0]!.hex);
    expect(pumpImage).not.toBe(loaferImage);
    expect(readFileSync(assetPath(pumpImage)).equals(readFileSync(assetPath(loaferImage)))).toBe(
      false,
    );
  });
});
