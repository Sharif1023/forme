import type { Gender } from "./bodies";
import { defaultSize, getProduct, sizesFor, type Slot } from "./catalog";
import type { Outfit, Selection } from "./state";

interface StyledLook {
  name: string;
  pieces: Record<Slot, Pick<Selection, "productId" | "colorId">>;
}

const STYLED_LOOKS: Record<Gender, StyledLook[]> = {
  men: [
    {
      name: "Off-duty essentials",
      pieces: {
        top: { productId: "m-tee-crew", colorId: "ivory" },
        bottom: { productId: "m-pant-denim", colorId: "indigo" },
        shoes: { productId: "m-shoe-sneaker", colorId: "white" },
      },
    },
    {
      name: "City tailoring",
      pieces: {
        top: { productId: "m-shirt-oxford", colorId: "white" },
        bottom: { productId: "m-pant-pleat", colorId: "charcoal" },
        shoes: { productId: "m-shoe-loafer", colorId: "cognac" },
      },
    },
    {
      name: "Slow Sunday",
      pieces: {
        top: { productId: "m-shirt-camp", colorId: "sand" },
        bottom: { productId: "m-pant-pleat", colorId: "cream" },
        shoes: { productId: "m-shoe-sneaker", colorId: "bone" },
      },
    },
  ],
  women: [
    {
      name: "Weekend ease",
      pieces: {
        top: { productId: "w-tee-crew", colorId: "ivory" },
        bottom: { productId: "w-pant-jean", colorId: "indigo" },
        shoes: { productId: "w-shoe-sneaker", colorId: "white" },
      },
    },
    {
      name: "Soft tailoring",
      pieces: {
        top: { productId: "w-shirt-poplin", colorId: "butter" },
        bottom: { productId: "w-pant-wide", colorId: "camel" },
        shoes: { productId: "w-shoe-pump", colorId: "nude" },
      },
    },
    {
      name: "Evening edit",
      pieces: {
        top: { productId: "w-shirt-camp", colorId: "emerald" },
        bottom: { productId: "w-pant-cigarette", colorId: "black" },
        shoes: { productId: "w-shoe-boot", colorId: "black" },
      },
    },
  ],
};

/** Cycle through coordinated outfits while retaining each supported selected size. */
export function nextStyledLook(gender: Gender, current: Outfit): { name: string; outfit: Outfit } {
  const looks = STYLED_LOOKS[gender];
  const currentIndex = looks.findIndex(
    (look) => look.pieces.top.productId === current.top.productId,
  );
  const next = looks[(currentIndex + 1) % looks.length]!;
  const select = (slot: Slot): Selection => {
    const piece = next.pieces[slot];
    const product = getProduct(piece.productId)!;
    const size = sizesFor(product).includes(current[slot].size)
      ? current[slot].size
      : defaultSize(product);
    return { ...piece, size };
  };

  return {
    name: next.name,
    outfit: { top: select("top"), bottom: select("bottom"), shoes: select("shoes") },
  };
}
