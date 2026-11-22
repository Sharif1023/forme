import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORY_LABEL,
  categoryToSlot,
  defaultSize,
  formatPrice,
  sizesFor,
  type Product,
} from "@/lib/forme/catalog";
import { cn } from "@/lib/utils";
import { GarmentThumb } from "./GarmentThumb";
import { useStudio } from "./store";

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { state, dispatch } = useStudio();
  const slot = categoryToSlot(product.category);
  const worn = state.outfits[state.gender][slot];
  const isWorn = worn.productId === product.id;
  const colorId = isWorn ? worn.colorId : product.colors[0]!.id;
  const color = product.colors.find((c) => c.id === colorId) ?? product.colors[0]!;

  const wear = (cid?: string) =>
    dispatch({ type: "wear", productId: product.id, colorId: cid ?? colorId });
  const addToBag = () => {
    const size = isWorn
      ? worn.size
      : sizesFor(product).includes(worn.size)
        ? worn.size
        : defaultSize(product);
    dispatch({ type: "addToCart", selection: { productId: product.id, colorId, size } });
    toast(`${product.name} added to bag`, { description: `${color.name} · Size ${size}` });
  };

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card p-1.5 transition-[border-color,box-shadow,transform] duration-300",
        isWorn
          ? "border-coral/70 shadow-[0_0_0_1px_var(--coral)]"
          : "border-border/65 hover:border-studio-deep hover:shadow-card",
        compact && "w-[150px] shrink-0",
      )}
    >
      <button
        type="button"
        onClick={() => wear()}
        aria-pressed={isWorn}
        aria-label={`Try on ${product.name} in ${color.name}`}
        className="flex flex-col rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-[#eeebe6]">
          <GarmentThumb
            product={product}
            hex={color.hex}
            className="h-full w-full transition-transform duration-700 group-hover:scale-[1.045]"
          />
          {isWorn && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-coral px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-coral-foreground">
              <Check className="size-3" aria-hidden /> Wearing
            </span>
          )}
        </div>
        <div className="w-full px-1.5 pt-3">
          <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {CATEGORY_LABEL[product.category]}
          </p>
          <h3 className="line-clamp-2 min-h-[2.5em] text-[12px] font-medium leading-[1.35] text-foreground">
            {product.name}
          </h3>
          <p className="mt-1 text-[12px] font-semibold tabular-nums text-foreground">
            {formatPrice(product.price)}
          </p>
        </div>
      </button>
      <div className="flex items-center justify-between gap-1 px-1.5 pb-1 pt-2">
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={`${product.name} colours`}
        >
          {product.colors.map((c) => {
            const active = isWorn && c.id === colorId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => wear(c.id)}
                aria-label={`Try ${product.name} in ${c.name}`}
                aria-pressed={active}
                title={c.name}
                className={cn(
                  "grid size-6 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "ring-1 ring-foreground" : "hover:ring-1 hover:ring-studio-deep",
                )}
              >
                <span
                  className="size-3.5 rounded-full border border-foreground/15"
                  style={{ backgroundColor: c.hex }}
                />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addToBag}
          aria-label={`Add ${product.name} to bag`}
          title="Add to bag"
          className="grid size-7 place-items-center rounded-full border border-border/80 bg-background text-foreground transition hover:border-foreground hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
    </article>
  );
}
