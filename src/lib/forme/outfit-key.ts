import type { Gender } from "./bodies";
import type { Outfit } from "./state";

/** Sizes do not change the photographed pose; all garment and colour IDs do. */
export function outfitImageKey(gender: Gender, outfit: Outfit): string {
  const pieces = (["top", "bottom", "shoes"] as const).map((slot) => {
    const selection = outfit[slot];
    return `${selection.productId}--${selection.colorId}`;
  });
  return `${gender}/${pieces.join("__")}`;
}
