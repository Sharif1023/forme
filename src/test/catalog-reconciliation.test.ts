import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PRODUCTS, getProduct } from "@/lib/forme/catalog";
import { getOutfitImage } from "@/lib/forme/outfit-images";
import { DEFAULT_OUTFITS, initialState, parseStored, reducer } from "@/lib/forme/state";
import { nextStyledLook } from "@/lib/forme/styled-looks";

const original = structuredClone(PRODUCTS);

beforeEach(() => {
  for (const product of original) Object.assign(getProduct(product.id)!, structuredClone(product));
});
afterEach(() => {
  for (const product of original) Object.assign(getProduct(product.id)!, structuredClone(product));
});

describe("Studio resilience to catalog changes", () => {
  it("skips coordinated looks whose photographed garments have been changed", () => {
    const state = initialState();
    getProduct("m-tee-crew")!.previewSupported = false;
    getProduct("m-shirt-camp")!.active = false;
    const look = nextStyledLook("men", state.outfits.men);
    expect(look?.name).toBe("City tailoring");
    expect(() => getOutfitImage("men", look!.outfit)).not.toThrow();
  });

  it("reports no coordinated look when all prepared choices are retired", () => {
    const state = initialState();
    for (const product of PRODUCTS) product.active = false;
    expect(nextStyledLook("men", state.outfits.men)).toBeNull();
  });
  it("uses an existing prepared colour when the starting colour has been removed", () => {
    const product = getProduct("m-shirt-oxford")!;
    product.colors = product.colors.filter((color) => color.id !== "sky");
    const state = initialState();
    expect(state.outfits.men.top).toEqual({ productId: product.id, colorId: "white", size: "M" });
    expect(() => getOutfitImage("men", state.outfits.men)).not.toThrow();
    expect(reducer(state, { type: "resetOutfit" }).outfits.men.top.colorId).toBe("white");
  });

  it("reconciles current garments after refresh while preserving bag and original saved looks", () => {
    let state = initialState();
    state = reducer(state, { type: "addOutfitToCart" });
    state = reducer(state, { type: "saveLook", id: "original", name: "Original", createdAt: 1 });
    getProduct("m-shirt-oxford")!.previewSupported = false;
    const next = reducer(state, { type: "reconcileCatalog" });
    expect(next.outfits.men.top.productId).not.toBe("m-shirt-oxford");
    expect(() => getOutfitImage("men", next.outfits.men)).not.toThrow();
    expect(next.cart).toBe(state.cart);
    expect(next.looks).toBe(state.looks);
    expect(next.looks[0]!.outfit).toEqual(DEFAULT_OUTFITS.men);
    expect(() => getOutfitImage("men", next.looks[0]!.outfit)).toThrow();
    const restored = parseStored(JSON.stringify(state));
    expect(restored.looks).toEqual(state.looks);
    expect(restored.outfits.men.top.productId).not.toBe("m-shirt-oxford");
  });

  it("retains saved selections when their colour or product no longer exists", () => {
    const state = initialState();
    state.looks.push({
      id: "old",
      name: "Original",
      gender: "men",
      createdAt: 1,
      outfit: {
        ...structuredClone(DEFAULT_OUTFITS.men),
        top: { productId: "retired-product", colorId: "retired-colour", size: "M" },
      },
    });
    expect(parseStored(JSON.stringify(state)).looks).toEqual(state.looks);
  });

  it("handles an empty prepared catalog without manufacturing a replacement preview", () => {
    for (const product of PRODUCTS) product.active = false;
    const state = initialState();
    expect(state.outfits.men).toEqual(DEFAULT_OUTFITS.men);
    expect(() => getOutfitImage("men", state.outfits.men)).toThrow();
    expect(reducer(state, { type: "reconcileCatalog" })).toBe(state);
    expect(() => reducer(state, { type: "resetOutfit" })).not.toThrow();
    expect(parseStored(JSON.stringify(state)).outfits).toEqual(state.outfits);
  });
});
