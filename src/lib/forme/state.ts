import type { Gender } from "./bodies";
import { PRODUCTS, canPreviewProduct, categoryToSlot, defaultSize, getProduct, sizesFor, type Slot } from "./catalog";

export interface Selection {
  productId: string;
  colorId: string;
  size: string;
}
export type Outfit = Record<Slot, Selection>;

export interface CartItem {
  key: string;
  productId: string;
  colorId: string;
  size: string;
  qty: number;
}

export interface SavedLook {
  id: string;
  name: string;
  gender: Gender;
  outfit: Outfit;
  createdAt: number;
}

export interface StudioState {
  gender: Gender;
  outfits: Record<Gender, Outfit>;
  cart: CartItem[];
  looks: SavedLook[];
}

export const DEFAULT_OUTFITS: Record<Gender, Outfit> = {
  men: {
    top: { productId: "m-shirt-oxford", colorId: "sky", size: "M" },
    bottom: { productId: "m-pant-chino", colorId: "khaki", size: "M" },
    shoes: { productId: "m-shoe-sneaker", colorId: "white", size: "9" },
  },
  women: {
    top: { productId: "w-shirt-camp", colorId: "champagne", size: "S" },
    bottom: { productId: "w-pant-jean", colorId: "indigo", size: "S" },
    shoes: { productId: "w-shoe-pump", colorId: "black", size: "7" },
  },
};

const SLOTS: Slot[] = ["top", "bottom", "shoes"];

/** Repair a current selection after catalog edits, using only prepared, active garments. */
export function reconcileOutfit(outfit: Outfit, gender: Gender): Outfit {
  let next = outfit;
  for (const slot of SLOTS) {
    const current = outfit[slot];
    if (
      validSelection(current, gender) &&
      categoryToSlot(getProduct(current.productId)!.category) === slot
    )
      continue;
    const eligible = (id: string) => {
      const product = getProduct(id);
      return product &&
        product.gender === gender &&
        canPreviewProduct(product) &&
        categoryToSlot(product.category) === slot &&
        product.colors.length > 0 &&
        sizesFor(product).length > 0
        ? product
        : undefined;
    };
    const product =
      eligible(current.productId) ??
      eligible(DEFAULT_OUTFITS[gender][slot].productId) ??
      PRODUCTS.find((candidate) => eligible(candidate.id));
    // Keep the user's selection metadata when a whole slot has no prepared options.
    // The model then shows an unavailable state instead of substituting another image.
    if (!product) continue;
    const sizes = sizesFor(product);
    const preferredSize = defaultSize(product);
    const selection: Selection = {
      productId: product.id,
      colorId: product.colors.some((color) => color.id === current.colorId)
        ? current.colorId
        : product.colors[0]!.id,
      size: sizes.includes(current.size)
        ? current.size
        : sizes.includes(preferredSize)
          ? preferredSize
          : sizes[0]!,
    };
    if (next === outfit) next = { ...outfit };
    next[slot] = selection;
  }
  return next;
}

const startingOutfit = (gender: Gender) =>
  reconcileOutfit(structuredClone(DEFAULT_OUTFITS[gender]), gender);

export const initialState = (): StudioState => ({
  gender: "men",
  outfits: { men: startingOutfit("men"), women: startingOutfit("women") },
  cart: [],
  looks: [],
});

export type Action =
  | { type: "hydrate"; state: StudioState }
  | { type: "reconcileCatalog" }
  | { type: "setGender"; gender: Gender }
  | { type: "wear"; productId: string; colorId?: string }
  | { type: "applyOutfit"; outfit: Outfit }
  | { type: "setSize"; slot: Slot; size: string }
  | { type: "resetOutfit" }
  | { type: "addToCart"; selection: Selection; qty?: number }
  | { type: "addOutfitToCart" }
  | { type: "setQty"; key: string; qty: number }
  | { type: "removeItem"; key: string }
  | { type: "clearCart" }
  | { type: "saveLook"; id: string; name: string; createdAt: number }
  | { type: "restoreLook"; id: string }
  | { type: "deleteLook"; id: string };

export const cartKey = (s: Selection) => `${s.productId}|${s.colorId}|${s.size}`;

function addItem(cart: CartItem[], selection: Selection, qty = 1): CartItem[] {
  const key = cartKey(selection);
  const existing = cart.find((i) => i.key === key);
  if (existing) return cart.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
  return [...cart, { key, ...selection, qty }];
}

export function reducer(state: StudioState, action: Action): StudioState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "reconcileCatalog": {
      const men = reconcileOutfit(state.outfits.men, "men");
      const women = reconcileOutfit(state.outfits.women, "women");
      return men === state.outfits.men && women === state.outfits.women
        ? state
        : { ...state, outfits: { men, women } };
    }
    case "setGender":
      return { ...state, gender: action.gender };
    case "applyOutfit": {
      if (!validOutfit(action.outfit, state.gender)) return state;
      return {
        ...state,
        outfits: { ...state.outfits, [state.gender]: structuredClone(action.outfit) },
      };
    }
    case "wear": {
      const product = getProduct(action.productId);
      if (
        !product ||
        product.gender !== state.gender ||
        !canPreviewProduct(product)
      )
        return state;
      const slot = categoryToSlot(product.category);
      const current = state.outfits[state.gender][slot];
      const colorId = product.colors.some((c) => c.id === action.colorId)
        ? action.colorId!
        : product.colors[0]!.id;
      const sizes = sizesFor(product);
      const preferredSize = defaultSize(product);
      const size = sizes.includes(current.size)
        ? current.size
        : sizes.includes(preferredSize)
          ? preferredSize
          : sizes[0]!;
      return {
        ...state,
        outfits: {
          ...state.outfits,
          [state.gender]: {
            ...state.outfits[state.gender],
            [slot]: { productId: product.id, colorId, size },
          },
        },
      };
    }
    case "setSize": {
      const outfit = state.outfits[state.gender];
      const product = getProduct(outfit[action.slot].productId);
      if (!product || !sizesFor(product).includes(action.size)) return state;
      return {
        ...state,
        outfits: {
          ...state.outfits,
          [state.gender]: {
            ...outfit,
            [action.slot]: { ...outfit[action.slot], size: action.size },
          },
        },
      };
    }
    case "resetOutfit":
      return {
        ...state,
        outfits: {
          ...state.outfits,
          [state.gender]: startingOutfit(state.gender),
        },
      };
    case "addToCart":
      return { ...state, cart: addItem(state.cart, action.selection, action.qty ?? 1) };
    case "addOutfitToCart": {
      const o = state.outfits[state.gender];
      let cart = state.cart;
      for (const slot of ["top", "bottom", "shoes"] as const) cart = addItem(cart, o[slot]);
      return { ...state, cart };
    }
    case "setQty":
      return {
        ...state,
        cart: state.cart.map((i) =>
          i.key === action.key
            ? { ...i, qty: Math.max(1, Math.min(20, Math.round(action.qty))) }
            : i,
        ),
      };
    case "removeItem":
      return { ...state, cart: state.cart.filter((i) => i.key !== action.key) };
    case "clearCart":
      return { ...state, cart: [] };
    case "saveLook": {
      const name = action.name.trim() || "Untitled look";
      const look: SavedLook = {
        id: action.id,
        name,
        gender: state.gender,
        outfit: structuredClone(state.outfits[state.gender]),
        createdAt: action.createdAt,
      };
      return { ...state, looks: [look, ...state.looks] };
    }
    case "restoreLook": {
      const look = state.looks.find((l) => l.id === action.id);
      if (!look) return state;
      return {
        ...state,
        gender: look.gender,
        outfits: { ...state.outfits, [look.gender]: structuredClone(look.outfit) },
      };
    }
    case "deleteLook":
      return { ...state, looks: state.looks.filter((l) => l.id !== action.id) };
  }
}

export function cartCount(cart: CartItem[]): number {
  return cart.reduce((n, i) => n + i.qty, 0);
}
export function cartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, i) => sum + (getProduct(i.productId)?.price ?? 0) * i.qty, 0);
}
export function outfitTotal(outfit: Outfit): number {
  return (["top", "bottom", "shoes"] as const).reduce(
    (s, slot) => s + (getProduct(outfit[slot].productId)?.price ?? 0),
    0,
  );
}

/* ---------- persistence ---------- */
export const STORAGE_KEY = "forme:studio:v1";

function validSelection(s: unknown, gender: Gender): s is Selection {
  if (!s || typeof s !== "object") return false;
  const sel = s as Selection;
  const p = typeof sel.productId === "string" ? getProduct(sel.productId) : undefined;
  return (
    !!p &&
    canPreviewProduct(p) &&
    p.gender === gender &&
    p.colors.some((color) => color.id === sel.colorId) &&
    sizesFor(p).includes(sel.size)
  );
}

/** Saved looks retain their original selections even if products later leave the catalog. */
function storedOutfitShape(o: unknown): o is Outfit {
  if (!o || typeof o !== "object") return false;
  const outfit = o as Outfit;
  return SLOTS.every((slot) => {
    const selection = outfit[slot];
    return (
      selection &&
      typeof selection.productId === "string" &&
      typeof selection.colorId === "string" &&
      typeof selection.size === "string"
    );
  });
}
function validOutfit(o: unknown, gender: Gender): o is Outfit {
  if (!o || typeof o !== "object") return false;
  const out = o as Outfit;
  return (
    validSelection(out.top, gender) &&
    validSelection(out.bottom, gender) &&
    validSelection(out.shoes, gender) &&
    categoryToSlot(getProduct(out.top.productId)!.category) === "top" &&
    categoryToSlot(getProduct(out.bottom.productId)!.category) === "bottom" &&
    categoryToSlot(getProduct(out.shoes.productId)!.category) === "shoes"
  );
}

/** Parse stored JSON defensively; anything unknown falls back to defaults. */
export function parseStored(raw: string | null): StudioState {
  const base = initialState();
  if (!raw) return base;
  try {
    const data = JSON.parse(raw) as Partial<StudioState>;
    const gender: Gender = data.gender === "women" ? "women" : "men";
    const outfits = {
      men: storedOutfitShape(data.outfits?.men)
        ? reconcileOutfit(data.outfits.men, "men")
        : base.outfits.men,
      women: storedOutfitShape(data.outfits?.women)
        ? reconcileOutfit(data.outfits.women, "women")
        : base.outfits.women,
    };
    const cart = Array.isArray(data.cart)
      ? data.cart.filter((i) => i && typeof i.qty === "number" && getProduct(i.productId))
      : [];
    const looks = Array.isArray(data.looks)
      ? data.looks.filter(
          (l) =>
            l &&
            typeof l.id === "string" &&
            (l.gender === "men" || l.gender === "women") &&
            storedOutfitShape(l.outfit),
        )
      : [];
    return { gender, outfits, cart, looks };
  } catch {
    return base;
  }
}
