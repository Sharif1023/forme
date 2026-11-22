import type { Gender } from "./bodies";
import { categoryToSlot, getColor, getProduct, type Product } from "./catalog";
import { outfitImageKey } from "./outfit-key";
import type { Outfit } from "./state";

/** Resolve an exact pre-generated combination. Never substitute a similar garment. */
export function getOutfitImage(gender: Gender, outfit: Outfit): { key: string; src: string } {
  for (const slot of ["top", "bottom", "shoes"] as const) {
    const selection = outfit[slot];
    const product = getProduct(selection.productId);
    if (
      !product ||
      product.gender !== gender ||
      categoryToSlot(product.category) !== slot ||
      !product.colors.some((color) => color.id === selection.colorId)
    ) {
      throw new Error(`Invalid ${gender} outfit selection: ${slot}`);
    }
  }
  const key = outfitImageKey(gender, outfit);
  return { key, src: `/images/looks/${key}.webp` };
}

/** Each product has its own photographed cut, model and pre-rendered colour. */
export function getProductImage(product: Product, hex: string): string {
  const color =
    product.colors.find((candidate) => candidate.hex.toLowerCase() === hex.toLowerCase()) ??
    getColor(product, "");
  return `/images/products/${product.id}--${color.id}.webp`;
}
