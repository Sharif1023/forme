import { ArrowLeftRight, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { getColor, getProduct, SLOT_LABEL, sizesFor, type Slot } from "@/lib/forme/catalog";
import { money } from "@/lib/commerce/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GarmentThumb } from "./GarmentThumb";
import { useStudio } from "./store";
import { useCommerce } from "@/lib/commerce/store";

const SLOTS: Slot[] = ["top", "bottom", "shoes"];

export function OutfitSummary({
  variant,
  onReplace,
}: {
  variant: "bar" | "list";
  onReplace: (slot: Slot) => void;
}) {
  const { state, dispatch } = useStudio();
  const { variants } = useCommerce();
  const outfit = state.outfits[state.gender];
  const selectedVariant = (slot: Slot) =>
    variants.find(
      (item) =>
        item.productId === outfit[slot].productId &&
        item.colorId === outfit[slot].colorId &&
        item.size === outfit[slot].size,
    );
  const total = SLOTS.reduce(
    (sum, slot) =>
      sum +
      (selectedVariant(slot)?.pricePaise ?? (getProduct(outfit[slot].productId)?.price ?? 0) * 100),
    0,
  );
  const available = SLOTS.every((slot) => {
    const item = selectedVariant(slot);
    return item && item.active !== false && item.stock > 0;
  });
  const list = variant === "list";

  const addOutfit = () => {
    if (!available) {
      toast.error("Choose an available colour and size for every piece.");
      return;
    }
    dispatch({ type: "addOutfitToCart" });
    toast("Full outfit added to bag", { description: `3 pieces · ${money(total)}` });
  };

  return (
    <div className={cn(list ? "space-y-3" : "glass flex items-stretch gap-2 rounded-[22px] p-2")}>
      <ul
        className={cn(list ? "space-y-2" : "grid min-w-0 flex-1 grid-cols-3 gap-2")}
        aria-label="Current outfit"
      >
        {SLOTS.map((slot) => {
          const sel = outfit[slot];
          const product = getProduct(sel.productId);
          if (!product) return null;
          const color = getColor(product, sel.colorId);
          const sizeId = `size-${variant}-${slot}`;
          return (
            <li
              key={slot}
              className={cn(
                "flex min-w-0 items-center gap-2.5 rounded-2xl bg-card/70 p-2",
                list && "border border-border bg-card",
              )}
            >
              <div
                className={cn(
                  "shrink-0 overflow-hidden rounded-xl bg-thumb-gradient",
                  list ? "size-16" : "hidden size-12 xl:block",
                )}
              >
                <GarmentThumb
                  product={product}
                  hex={color.hex}
                  colorId={sel.colorId}
                  className="h-full w-full p-1"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {SLOT_LABEL[slot]}
                </p>
                <p
                  className="truncate text-[13px] font-medium text-foreground"
                  title={product.name}
                >
                  {product.name}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <span
                    className="size-2.5 shrink-0 rounded-full border border-foreground/15"
                    style={{ backgroundColor: color.hex }}
                    aria-hidden
                  />
                  <span className="truncate">{color.name}</span>
                  <label htmlFor={sizeId} className="sr-only">
                    {SLOT_LABEL[slot]} size
                  </label>
                  <select
                    id={sizeId}
                    value={sel.size}
                    onChange={(e) => dispatch({ type: "setSize", slot, size: e.target.value })}
                    className="ml-auto h-6 shrink-0 cursor-pointer rounded-full border border-border bg-background px-1.5 text-[11px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {sizesFor(product).map((s) => (
                      <option key={s} value={s}>
                        {product.category === "shoes" ? `US ${s}` : s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  disabled={
                    !selectedVariant(slot)?.active || (selectedVariant(slot)?.stock ?? 0) < 1
                  }
                  onClick={() => {
                    dispatch({ type: "addToCart", selection: sel });
                    toast(`${product.name} added to bag`, {
                      description: `${color.name} · Size ${sel.size}`,
                    });
                  }}
                  aria-label={`Add ${product.name} to bag`}
                  title="Add to bag"
                  className="grid size-7 place-items-center rounded-full bg-background text-foreground transition hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ShoppingBag className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onReplace(slot)}
                  aria-label={`Replace ${SLOT_LABEL[slot].toLowerCase()}`}
                  title="Replace"
                  className="grid size-7 place-items-center rounded-full bg-background text-foreground transition hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeftRight className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div
        className={cn(
          "flex shrink-0 flex-col justify-center gap-1.5",
          list ? "pt-1" : "w-[150px] px-2",
        )}
      >
        <div
          className={cn("flex", list ? "items-baseline justify-between gap-2" : "flex-col gap-0.5")}
        >
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Outfit
          </span>
          <span
            className={cn(
              "font-serif leading-none text-foreground",
              list ? "text-2xl" : "text-[22px]",
            )}
          >
            {money(total)}
          </span>
        </div>
        <Button
          variant="coral"
          size={list ? "pill" : "sm"}
          className={cn("w-full", !list && "rounded-full")}
          onClick={addOutfit}
          disabled={!available}
        >
          <ShoppingBag aria-hidden /> Add outfit to bag
        </Button>
      </div>
    </div>
  );
}
