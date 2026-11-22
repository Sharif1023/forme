import type { Gender } from "./bodies";

export type Category = "tshirts" | "shirts" | "pants" | "shoes";
export type Slot = "top" | "bottom" | "shoes";

export type TopStyle =
  | { kind: "tee"; neckline: "crew" | "v"; fit: "fitted" | "regular" | "boxy"; pocket?: boolean }
  | { kind: "shirt"; collar: "point" | "buttondown" | "camp" | "band"; sleeve: "long" | "short" };
export type PantStyle = {
  kind: "pants";
  cut: "slim" | "wide" | "straight" | "cigarette";
  denim?: boolean;
  pleats?: boolean;
};
export type ShoeStyle = {
  kind: "shoes";
  shoe: "sneaker" | "loafer" | "chelsea" | "pump" | "ankleboot";
};
export type GarmentStyle = TopStyle | PantStyle | ShoeStyle;

export interface ColorOption {
  id: string;
  name: string;
  hex: string;
}

export interface Product {
  id: string;
  gender: Gender;
  category: Category;
  name: string;
  price: number;
  description: string;
  colors: ColorOption[];
  style: GarmentStyle;
  active?: boolean;
  previewSupported?: boolean;
  imageUrl?: string | null;
  pricePaise?: number;
  sizes?: string[];
}

export const CATEGORY_LABEL: Record<Category, string> = {
  tshirts: "T-shirts",
  shirts: "Shirts",
  pants: "Pants",
  shoes: "Shoes",
};

export const SLOT_LABEL: Record<Slot, string> = { top: "Top", bottom: "Bottoms", shoes: "Shoes" };

export const categoryToSlot = (c: Category): Slot =>
  c === "pants" ? "bottom" : c === "shoes" ? "shoes" : "top";

export const APPAREL_SIZES = ["S", "M", "L", "XL"] as const;
export const SHOE_SIZES: Record<Gender, string[]> = {
  men: ["7", "8", "9", "10", "11", "12"],
  women: ["5", "6", "7", "8", "9", "10"],
};
export function sizesFor(product: Product): string[] {
  if (product.sizes?.length) return product.sizes;
  return product.category === "shoes" ? SHOE_SIZES[product.gender] : [...APPAREL_SIZES];
}
export function defaultSize(product: Product): string {
  return product.category === "shoes" ? (product.gender === "men" ? "9" : "7") : "M";
}

const c = (id: string, name: string, hex: string): ColorOption => ({ id, name, hex });

const STUDIO_PRODUCTS: Product[] = [
  // ---------- Men ----------
  {
    id: "m-tee-crew",
    gender: "men",
    category: "tshirts",
    name: "Essential Crew Tee",
    price: 28,
    description: "Midweight cotton jersey with a ribbed crew neck.",
    colors: [
      c("ivory", "Ivory", "#EEE8DC"),
      c("charcoal", "Charcoal", "#34312C"),
      c("sage", "Sage", "#8F9A7F"),
    ],
    style: { kind: "tee", neckline: "crew", fit: "regular" },
  },
  {
    id: "m-tee-pocket",
    gender: "men",
    category: "tshirts",
    name: "Heavyweight Pocket Tee",
    price: 36,
    description: "Boxy, dropped-shoulder tee with a chest pocket.",
    colors: [
      c("oat", "Oat", "#D6C8AE"),
      c("navy", "Navy", "#2D3646"),
      c("coral", "Coral", "#D66B4D"),
    ],
    style: { kind: "tee", neckline: "crew", fit: "boxy", pocket: true },
  },
  {
    id: "m-tee-v",
    gender: "men",
    category: "tshirts",
    name: "Pima V-Neck Tee",
    price: 32,
    description: "Soft pima cotton with a clean, close fit.",
    colors: [
      c("white", "White", "#F5F3EE"),
      c("heather", "Heather Grey", "#A8A59F"),
      c("black", "Black", "#22201D"),
    ],
    style: { kind: "tee", neckline: "v", fit: "fitted" },
  },
  {
    id: "m-shirt-oxford",
    gender: "men",
    category: "shirts",
    name: "Oxford Button-Down",
    price: 68,
    description: "Long-sleeve oxford cloth with a button-down collar.",
    colors: [
      c("sky", "Sky", "#AFC2D6"),
      c("white", "White", "#F3F1EB"),
      c("blush", "Pale Pink", "#E6C7BE"),
    ],
    style: { kind: "shirt", collar: "buttondown", sleeve: "long" },
  },
  {
    id: "m-shirt-camp",
    gender: "men",
    category: "shirts",
    name: "Linen Camp Shirt",
    price: 74,
    description: "Short-sleeve linen with a relaxed open collar.",
    colors: [
      c("sand", "Sand", "#CDB797"),
      c("terracotta", "Terracotta", "#B4603F"),
      c("ecru", "Ecru", "#E8E0CE"),
    ],
    style: { kind: "shirt", collar: "camp", sleeve: "short" },
  },
  {
    id: "m-shirt-band",
    gender: "men",
    category: "shirts",
    name: "Band Collar Shirt",
    price: 72,
    description: "Long-sleeve cotton with a minimal band collar.",
    colors: [
      c("chambray", "Chambray", "#7E93AC"),
      c("stone", "Stone", "#BDB2A2"),
      c("ink", "Ink", "#262B3B"),
    ],
    style: { kind: "shirt", collar: "band", sleeve: "long" },
  },
  {
    id: "m-pant-chino",
    gender: "men",
    category: "pants",
    name: "Slim Stretch Chino",
    price: 78,
    description: "Tapered leg, ankle length, gentle stretch.",
    colors: [
      c("khaki", "Khaki", "#B8A47E"),
      c("navy", "Navy", "#2C3343"),
      c("olive", "Olive", "#5E6247"),
    ],
    style: { kind: "pants", cut: "slim" },
  },
  {
    id: "m-pant-pleat",
    gender: "men",
    category: "pants",
    name: "Relaxed Pleated Trouser",
    price: 96,
    description: "Front pleats and a wide, easy leg with a full break.",
    colors: [
      c("charcoal", "Charcoal", "#3C3935"),
      c("taupe", "Taupe", "#8D7C69"),
      c("cream", "Cream", "#E2D8C7"),
    ],
    style: { kind: "pants", cut: "wide", pleats: true },
  },
  {
    id: "m-pant-denim",
    gender: "men",
    category: "pants",
    name: "Straight Selvedge Denim",
    price: 110,
    description: "Rigid straight-leg denim with contrast stitching.",
    colors: [
      c("indigo", "Indigo", "#2F4366"),
      c("midwash", "Mid Wash", "#5D7798"),
      c("black", "Washed Black", "#2A2B2E"),
    ],
    style: { kind: "pants", cut: "straight", denim: true },
  },
  {
    id: "m-shoe-sneaker",
    gender: "men",
    category: "shoes",
    name: "Court Leather Sneaker",
    price: 120,
    description: "Low-top leather sneaker on a cupsole.",
    colors: [
      c("white", "White", "#F2F0EA"),
      c("bone", "Bone", "#DCD2C0"),
      c("black", "Black", "#24221F"),
    ],
    style: { kind: "shoes", shoe: "sneaker" },
  },
  {
    id: "m-shoe-loafer",
    gender: "men",
    category: "shoes",
    name: "Penny Loafer",
    price: 165,
    description: "Polished leather loafer with a classic strap.",
    colors: [
      c("cognac", "Cognac", "#8A4B2A"),
      c("chocolate", "Chocolate", "#4B3022"),
      c("black", "Black", "#1F1D1B"),
    ],
    style: { kind: "shoes", shoe: "loafer" },
  },
  {
    id: "m-shoe-chelsea",
    gender: "men",
    category: "shoes",
    name: "Suede Chelsea Boot",
    price: 185,
    description: "Suede ankle boot with elastic side panels.",
    colors: [
      c("tobacco", "Tobacco", "#7A5A3E"),
      c("taupe", "Taupe", "#8E8172"),
      c("black", "Black", "#252321"),
    ],
    style: { kind: "shoes", shoe: "chelsea" },
  },
  // ---------- Women ----------
  {
    id: "w-tee-crew",
    gender: "women",
    category: "tshirts",
    name: "Fitted Crew Tee",
    price: 26,
    description: "Close-fitting cotton tee with a slim crew neck.",
    colors: [
      c("ivory", "Ivory", "#EFE9DE"),
      c("black", "Black", "#24211E"),
      c("rose", "Dusty Rose", "#C99A92"),
    ],
    style: { kind: "tee", neckline: "crew", fit: "fitted" },
  },
  {
    id: "w-tee-boxy",
    gender: "women",
    category: "tshirts",
    name: "Boxy Cotton Tee",
    price: 34,
    description: "Relaxed boxy tee with a dropped shoulder.",
    colors: [
      c("oat", "Oat", "#D7CAB2"),
      c("coral", "Coral", "#D66B4D"),
      c("olive", "Olive", "#6A6B4E"),
    ],
    style: { kind: "tee", neckline: "crew", fit: "boxy" },
  },
  {
    id: "w-tee-v",
    gender: "women",
    category: "tshirts",
    name: "Soft V-Neck Tee",
    price: 30,
    description: "Lightweight modal blend with a gentle V.",
    colors: [
      c("white", "White", "#F5F2EC"),
      c("sky", "Powder Blue", "#B5C6D6"),
      c("heather", "Heather", "#A9A49D"),
    ],
    style: { kind: "tee", neckline: "v", fit: "regular" },
  },
  {
    id: "w-shirt-poplin",
    gender: "women",
    category: "shirts",
    name: "Poplin Button-Up",
    price: 64,
    description: "Crisp cotton poplin with a pointed collar.",
    colors: [
      c("white", "White", "#F4F2EC"),
      c("stripe", "Blue", "#9DB4CF"),
      c("butter", "Butter", "#E9D9A8"),
    ],
    style: { kind: "shirt", collar: "point", sleeve: "long" },
  },
  {
    id: "w-shirt-camp",
    gender: "women",
    category: "shirts",
    name: "Silk Camp Shirt",
    price: 98,
    description: "Fluid washed silk with a short sleeve and open collar.",
    colors: [
      c("champagne", "Champagne", "#E3D3B8"),
      c("emerald", "Emerald", "#2F5E4E"),
      c("coral", "Coral", "#D66B4D"),
    ],
    style: { kind: "shirt", collar: "camp", sleeve: "short" },
  },
  {
    id: "w-shirt-band",
    gender: "women",
    category: "shirts",
    name: "Linen Band Collar Shirt",
    price: 72,
    description: "Breezy linen with a band collar and long sleeves.",
    colors: [
      c("natural", "Natural", "#D9CDB8"),
      c("sage", "Sage", "#9BA68E"),
      c("navy", "Navy", "#2C3547"),
    ],
    style: { kind: "shirt", collar: "band", sleeve: "long" },
  },
  {
    id: "w-pant-wide",
    gender: "women",
    category: "pants",
    name: "Tailored Wide-Leg Trouser",
    price: 98,
    description: "High-rise, pressed crease, floor-grazing wide leg.",
    colors: [
      c("camel", "Camel", "#B08D66"),
      c("black", "Black", "#262422"),
      c("cream", "Cream", "#E5DCCB"),
    ],
    style: { kind: "pants", cut: "wide", pleats: true },
  },
  {
    id: "w-pant-jean",
    gender: "women",
    category: "pants",
    name: "High-Rise Straight Jean",
    price: 92,
    description: "Classic five-pocket denim with a straight leg.",
    colors: [
      c("indigo", "Indigo", "#334A6E"),
      c("lightwash", "Light Wash", "#8EA5C0"),
      c("ecru", "Ecru", "#E6DECD"),
    ],
    style: { kind: "pants", cut: "straight", denim: true },
  },
  {
    id: "w-pant-cigarette",
    gender: "women",
    category: "pants",
    name: "Cropped Cigarette Pant",
    price: 84,
    description: "Slim, cropped above the ankle with a sharp crease.",
    colors: [
      c("black", "Black", "#252321"),
      c("stone", "Stone", "#BFB3A1"),
      c("rust", "Rust", "#9C4F32"),
    ],
    style: { kind: "pants", cut: "cigarette" },
  },
  {
    id: "w-shoe-sneaker",
    gender: "women",
    category: "shoes",
    name: "Minimal Leather Sneaker",
    price: 115,
    description: "Clean low-top leather sneaker.",
    colors: [
      c("white", "White", "#F3F1EB"),
      c("blush", "Blush", "#E3C4B8"),
      c("black", "Black", "#24221F"),
    ],
    style: { kind: "shoes", shoe: "sneaker" },
  },
  {
    id: "w-shoe-pump",
    gender: "women",
    category: "shoes",
    name: "Pointed Slingback Pump",
    price: 140,
    description: "Pointed toe with a mid block heel and slingback strap.",
    colors: [
      c("black", "Black", "#211F1D"),
      c("nude", "Nude", "#C9A288"),
      c("coral", "Coral", "#D66B4D"),
    ],
    style: { kind: "shoes", shoe: "pump" },
  },
  {
    id: "w-shoe-boot",
    gender: "women",
    category: "shoes",
    name: "Leather Ankle Boot",
    price: 175,
    description: "Sleek ankle boot with a side zip.",
    colors: [
      c("cognac", "Cognac", "#8C522F"),
      c("black", "Black", "#22201E"),
      c("taupe", "Taupe", "#8F8173"),
    ],
    style: { kind: "shoes", shoe: "ankleboot" },
  },
];

export const PRODUCTS: Product[] = STUDIO_PRODUCTS.map((product) => ({
  ...product,
  price: product.price * 100,
  pricePaise: product.price * 10000,
  previewSupported: true,
  active: true,
}));
const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));
/** Keep the fitting catalog and persisted selections in sync with the MySQL store. */
export function applyCatalogSnapshot(
  products: (Partial<Product> & { id: string; pricePaise: number })[],
) {
  const ids = new Set(products.map((product) => product.id));
  for (const product of PRODUCTS) product.active = ids.has(product.id);
  for (const record of products) {
    const existing = BY_ID.get(record.id);
    const category = record.category ?? existing?.category ?? "tshirts";
    const fallback: GarmentStyle =
      category === "pants"
        ? { kind: "pants", cut: "straight" }
        : category === "shoes"
          ? { kind: "shoes", shoe: "sneaker" }
          : { kind: "tee", neckline: "crew", fit: "regular" };
    const product = {
      ...existing,
      ...record,
      name: record.name ?? existing?.name ?? record.id,
      gender: record.gender ?? existing?.gender ?? "men",
      category,
      description: record.description ?? "",
      colors: record.colors?.length
        ? record.colors
        : (existing?.colors ?? [c("default", "Default", "#ddd9d1")]),
      style: record.style ?? existing?.style ?? fallback,
      price: record.pricePaise / 100,
      previewSupported: record.previewSupported ?? existing?.previewSupported ?? false,
    } as Product;
    if (existing) Object.assign(existing, product);
    else {
      PRODUCTS.push(product);
      BY_ID.set(product.id, product);
    }
  }
}
export function getProduct(id: string): Product | undefined {
  return BY_ID.get(id);
}
export function getColor(product: Product, colorId: string): ColorOption {
  return product.colors.find((col) => col.id === colorId) ?? product.colors[0]!;
}

export type CategoryFilter = "all" | Category;

/** Wardrobe search + category filter for one model. */
export function filterProducts(gender: Gender, category: CategoryFilter, query: string): Product[] {
  const q = query.trim().toLowerCase();
  return PRODUCTS.filter((p) => {
    if (p.active === false || p.previewSupported === false) return false;
    if (p.gender !== gender) return false;
    if (category !== "all" && p.category !== category) return false;
    if (!q) return true;
    const hay = [
      p.name,
      CATEGORY_LABEL[p.category],
      p.description,
      ...p.colors.map((col) => col.name),
    ]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((word) => hay.includes(word));
  });
}

export const formatPrice = (n: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(n);
