import { describe, expect, it } from "vitest";
import {
  DEFAULT_OUTFITS,
  initialState,
  parseStored,
  reducer,
  type Outfit,
} from "@/lib/forme/state";

const curatedOutfit = (): Outfit => ({
  top: { productId: "m-tee-crew", colorId: "charcoal", size: "L" },
  bottom: { productId: "m-pant-denim", colorId: "indigo", size: "L" },
  shoes: { productId: "m-shoe-loafer", colorId: "cognac", size: "10" },
});

describe("Curated studio outfits", () => {
  it("applies all three pieces atomically while preserving the other model, bag and saved looks", () => {
    let state = initialState();
    state = reducer(state, { type: "addOutfitToCart" });
    state = reducer(state, { type: "saveLook", id: "before", name: "Original", createdAt: 1 });
    const outfit = curatedOutfit();
    const next = reducer(state, { type: "applyOutfit", outfit });

    expect(next.outfits.men).toEqual(outfit);
    expect(next.outfits.women).toBe(state.outfits.women);
    expect(next.cart).toBe(state.cart);
    expect(next.looks).toBe(state.looks);
    expect(state.outfits.men).toEqual(DEFAULT_OUTFITS.men);
    outfit.top.colorId = "sage";
    expect(next.outfits.men.top.colorId).toBe("charcoal");
  });

  it.each([
    { reason: "unknown product", top: { productId: "missing", colorId: "ivory", size: "M" } },
    { reason: "wrong model", top: { productId: "w-tee-crew", colorId: "ivory", size: "M" } },
    { reason: "wrong slot", top: { productId: "m-pant-chino", colorId: "khaki", size: "M" } },
    { reason: "unknown colour", top: { productId: "m-tee-crew", colorId: "missing", size: "M" } },
    { reason: "invalid size", top: { productId: "m-tee-crew", colorId: "ivory", size: "99" } },
  ])("rejects the complete outfit when one selection has an $reason", ({ top }) => {
    const state = initialState();
    const outfit = { ...curatedOutfit(), top };
    expect(reducer(state, { type: "applyOutfit", outfit })).toBe(state);
  });

  it("applies outfits to the active model only", () => {
    const state = reducer(initialState(), { type: "setGender", gender: "women" });
    const outfit = structuredClone(DEFAULT_OUTFITS.women);
    outfit.top.colorId = "emerald";
    const next = reducer(state, { type: "applyOutfit", outfit });
    expect(next.outfits.women.top.colorId).toBe("emerald");
    expect(next.outfits.men).toBe(state.outfits.men);
  });
});

describe("Studio selection validation", () => {
  it("rejects an apparel size for footwear and accepts an available shoe size", () => {
    const state = initialState();
    expect(reducer(state, { type: "setSize", slot: "shoes", size: "XL" })).toBe(state);
    expect(
      reducer(state, { type: "setSize", slot: "shoes", size: "10" }).outfits.men.shoes.size,
    ).toBe("10");
  });

  it("falls back to the default outfit when a stored colour is no longer available", () => {
    const stored = initialState();
    stored.outfits.men.top.colorId = "missing";
    expect(parseStored(JSON.stringify(stored)).outfits.men).toEqual(DEFAULT_OUTFITS.men);
  });
});
