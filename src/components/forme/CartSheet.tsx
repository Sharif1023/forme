import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { getColor, getProduct } from "@/lib/forme/catalog";
import { cartCount, type Selection } from "@/lib/forme/state";
import { GarmentThumb } from "./GarmentThumb";
import { useStudio } from "./store";
import { Link } from "react-router-dom";
import { useCommerce } from "@/lib/commerce/store";
import { money } from "@/lib/commerce/api";

export function CartSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { state, dispatch } = useStudio();
  const { variants } = useCommerce();
  const count = cartCount(state.cart);
  const itemPrice = (item: Selection) =>
    variants.find(
      (variant) =>
        variant.productId === item.productId &&
        variant.colorId === item.colorId &&
        variant.size === item.size,
    )?.pricePaise ?? (getProduct(item.productId)?.price ?? 0) * 100;
  const total = state.cart.reduce((sum, item) => sum + itemPrice(item) * item.qty, 0);
  const outfit = state.outfits[state.gender];
  const outfitItems = [outfit.top, outfit.bottom, outfit.shoes];
  const currentOutfitTotal = outfitItems.reduce((sum, item) => sum + itemPrice(item), 0);
  const outfitAvailable = outfitItems.every((item) =>
    variants.some(
      (variant) =>
        variant.productId === item.productId &&
        variant.colorId === item.colorId &&
        variant.size === item.size &&
        variant.active !== false &&
        variant.stock > 0,
    ),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[420px]">
        <SheetHeader className="border-b border-border px-6 pb-4 pt-6 text-left">
          <SheetTitle className="font-serif text-3xl font-normal">Your bag</SheetTitle>
          <SheetDescription>
            {count === 0 ? "Nothing here yet." : `${count} ${count === 1 ? "item" : "items"} · BDT`}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {state.cart.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center">
              <div className="grid size-14 place-items-center rounded-full bg-secondary">
                <ShoppingBag className="size-6 text-muted-foreground" aria-hidden />
              </div>
              <p className="mt-4 font-serif text-2xl">Your bag is empty</p>
              <p className="mt-1 max-w-[240px] text-sm text-muted-foreground">
                Add a single piece from the wardrobe, or the whole outfit you're wearing.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {state.cart.map((item) => {
                const product = getProduct(item.productId);
                if (!product) return null;
                const color = getColor(product, item.colorId);
                return (
                  <li
                    key={item.key}
                    className="flex gap-3 rounded-2xl border border-border bg-card p-2.5"
                  >
                    <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-thumb-gradient">
                      <GarmentThumb
                        product={product}
                        hex={color.hex}
                        className="h-full w-full p-1.5"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium">{product.name}</p>
                        <p className="shrink-0 text-sm">{money(itemPrice(item) * item.qty)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {color.name} · Size{" "}
                        {product.category === "shoes" ? `US ${item.size}` : item.size}
                      </p>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <div
                          className="flex items-center rounded-full border border-border"
                          role="group"
                          aria-label={`Quantity of ${product.name}`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              dispatch({ type: "setQty", key: item.key, qty: item.qty - 1 })
                            }
                            disabled={item.qty <= 1}
                            aria-label="Decrease quantity"
                            className="grid size-7 place-items-center rounded-full hover:bg-secondary disabled:opacity-40"
                          >
                            <Minus className="size-3" aria-hidden />
                          </button>
                          <span className="w-6 text-center text-xs font-medium" aria-live="polite">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              dispatch({ type: "setQty", key: item.key, qty: item.qty + 1 })
                            }
                            aria-label="Increase quantity"
                            className="grid size-7 place-items-center rounded-full hover:bg-secondary"
                          >
                            <Plus className="size-3" aria-hidden />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => dispatch({ type: "removeItem", key: item.key })}
                          aria-label={`Remove ${product.name}`}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <Trash2 className="size-3.5" aria-hidden /> Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-border bg-card/60 px-6 py-5">
          <Button
            variant="outline"
            className="w-full rounded-full"
            disabled={!outfitAvailable}
            onClick={() => {
              dispatch({ type: "addOutfitToCart" });
              toast("Full outfit added to bag", { description: money(currentOutfitTotal) });
            }}
          >
            <Plus aria-hidden /> Add current outfit ({money(currentOutfitTotal)})
          </Button>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="font-serif text-3xl">{money(total)}</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Delivery and any discounts are calculated at checkout. Your payment details are handled
            securely.
          </p>
          {state.cart.length > 0 && (
            <Link
              className="commerce-primary w-full"
              to="/checkout"
              onClick={() => onOpenChange(false)}
            >
              Continue to checkout →
            </Link>
          )}
          {state.cart.length > 0 && (
            <button
              type="button"
              onClick={() => dispatch({ type: "clearCart" })}
              className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
            >
              Clear bag
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
