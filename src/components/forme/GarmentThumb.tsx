import type { Product } from "@/lib/forme/catalog";
import { getProductImage } from "@/lib/forme/outfit-images";
import { cn } from "@/lib/utils";

/** The selected product's own model, silhouette and colour, generated ahead of time. */
export function GarmentThumb({
  product,
  hex,
  colorId,
  className,
}: {
  product: Product;
  hex: string;
  colorId?: string;
  className?: string;
}) {
  const color =
    colorId !== undefined
      ? product.colors.find((option) => option.id === colorId)
      : product.colors.find((option) => option.hex.toLowerCase() === hex.toLowerCase());
  const image =
    colorId !== undefined && !color
      ? "/images/product-placeholder.svg"
      : (color && product.tryOn?.colorImages?.[color.id]) ||
        product.imageUrl ||
        getProductImage(product, hex, colorId);
  return (
    <span aria-hidden="true" className={cn("relative block overflow-hidden", className)}>
      <img
        src={image}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-contain"
        onError={(event) => {
          const target = event.currentTarget;
          if (!target.dataset["fallback"]) {
            target.dataset["fallback"] = "true";
            target.src = "/images/product-placeholder.svg";
          }
        }}
      />
      <span
        className="absolute bottom-2 right-2 size-2.5 rounded-full border border-white/80 shadow-sm"
        style={{ backgroundColor: hex }}
      />
    </span>
  );
}
