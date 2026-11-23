import type { Product } from "@/lib/forme/catalog";
import { getProductImage } from "@/lib/forme/outfit-images";
import { cn } from "@/lib/utils";

/** The selected product's own model, silhouette and colour, generated ahead of time. */
export function GarmentThumb({
  product,
  hex,
  className,
}: {
  product: Product;
  hex: string;
  className?: string;
}) {
  const color = product.colors.find((option) => option.hex.toLowerCase() === hex.toLowerCase());
  return (
    <span aria-hidden="true" className={cn("relative block overflow-hidden", className)}>
      <img
        src={(color && product.tryOn?.colorImages?.[color.id]) || product.imageUrl || getProductImage(product, hex)}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-contain"
        onError={(event) => { const target=event.currentTarget; if (!target.dataset["fallback"]) {target.dataset["fallback"]="true";target.src="/images/product-placeholder.svg";} }}
      />
      <span
        className="absolute bottom-2 right-2 size-2.5 rounded-full border border-white/80 shadow-sm"
        style={{ backgroundColor: hex }}
      />
    </span>
  );
}
