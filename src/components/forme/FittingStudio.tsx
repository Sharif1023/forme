import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, Info, LayoutGrid, ShoppingBag, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  canPreviewProduct,
  categoryToSlot,
  getProduct,
  sizesFor,
  type CategoryFilter,
  type Slot,
} from "@/lib/forme/catalog";
import { toast } from "sonner";
import { cartCount } from "@/lib/forme/state";
import { CartSheet } from "./CartSheet";
import { HowItWorksDialog } from "./HowItWorksDialog";
import type { Focus } from "./HumanModel";
import { LooksSheet } from "./LooksSheet";
import { OutfitSummary } from "./OutfitSummary";
import { useStudio } from "./store";
import { Link, useSearchParams } from "react-router-dom";
import { StudioStage } from "./StudioStage";
import { WardrobePanel } from "./WardrobePanel";

const SLOT_CATEGORY: Record<Slot, CategoryFilter> = { top: "all", bottom: "pants", shoes: "shoes" };
const iconBtn =
  "relative grid size-10 place-items-center rounded-full text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Studio() {
  const { state, dispatch, hydrated } = useStudio();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedProduct = searchParams.get("try");
  const requestedColor = searchParams.get("color");
  const requestedSize = searchParams.get("size");
  useEffect(() => {
    if (!hydrated || !requestedProduct) return;
    const product = getProduct(requestedProduct);
    if (product && canPreviewProduct(product)) {
      dispatch({ type: "setGender", gender: product.gender });
      dispatch({
        type: "wear",
        productId: product.id,
        ...(requestedColor ? { colorId: requestedColor } : {}),
      });
      if (requestedSize && sizesFor(product).includes(requestedSize))
        dispatch({ type: "setSize", slot: categoryToSlot(product.category), size: requestedSize });
    } else {
      toast("This product's fitting preview is not ready yet.");
    }
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        for (const key of ["try", "color", "size"]) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }, [hydrated, requestedProduct, requestedColor, requestedSize, dispatch, setSearchParams]);
  const [focus, setFocus] = useState<Focus>("full");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [looksOpen, setLooksOpen] = useState(false);
  const [looksFocus, setLooksFocus] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [outfitOpen, setOutfitOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const count = cartCount(state.cart);

  const replace = (slot: Slot) => {
    const top = state.outfits[state.gender].top.productId;
    setCategory(
      slot === "top" ? (top.includes("tee") ? "tshirts" : "shirts") : SLOT_CATEGORY[slot],
    );
    setQuery("");
    setOutfitOpen(false);
    setFocus(slot === "top" ? "tops" : slot === "bottom" ? "bottoms" : "shoes");
    document.getElementById("wardrobe")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const openLooks = (focusInput: boolean) => {
    setLooksFocus(focusInput);
    setLooksOpen(true);
  };

  const bag = (
    <button
      type="button"
      onClick={() => setCartOpen(true)}
      aria-label={`Open bag, ${count} items`}
      title="Bag"
      className={iconBtn}
    >
      <ShoppingBag className="size-[18px]" aria-hidden />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] font-semibold text-coral-foreground">
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="studio-shell bg-background text-foreground">
      <nav
        aria-label="Main"
        className="hidden w-[88px] shrink-0 flex-col items-center gap-3 border-r border-border/70 bg-card/40 py-6 lg:flex"
      >
        <span className="mb-7 grid size-11 place-items-center rounded-2xl border border-border font-serif text-[34px] leading-none">
          f.
        </span>
        <button
          type="button"
          onClick={() => setFocus("full")}
          aria-label="Studio"
          title="Studio"
          className="studio-nav-item studio-nav-active"
        >
          <Sparkles className="size-[18px]" aria-hidden />
          <span>Studio</span>
        </button>
        <Link to="/shop" className="studio-nav-item" aria-label="Shop all products">
          <ShoppingBag className="size-[18px]" aria-hidden />
          <span>Shop</span>
        </Link>
        <button
          type="button"
          onClick={() => searchRef.current?.focus()}
          aria-label="Search wardrobe"
          title="Wardrobe"
          className="studio-nav-item"
        >
          <LayoutGrid className="size-[18px]" aria-hidden />
          <span>Wardrobe</span>
        </button>
        <button
          type="button"
          onClick={() => openLooks(false)}
          aria-label="Saved looks"
          title="Saved looks"
          className="studio-nav-item"
        >
          <Bookmark className="size-[18px]" aria-hidden />
          <span>My looks</span>
          {state.looks.length > 0 && <span className="studio-nav-count">{state.looks.length}</span>}
        </button>
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          aria-label={`Open bag, ${count} items`}
          title="Bag"
          className="studio-nav-item"
        >
          <ShoppingBag className="size-[18px]" aria-hidden />
          <span>My bag</span>
          {count > 0 && <span className="studio-nav-count">{count}</span>}
        </button>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label="How it works"
          title="How it works"
          className="studio-nav-item mt-auto"
        >
          <Info className="size-[18px]" aria-hidden />
          <span>Help</span>
        </button>
        <div
          className="mt-2 grid size-9 place-items-center rounded-full border border-border bg-secondary/60 font-serif text-lg"
          aria-hidden
        >
          f
        </div>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <main className="studio-main flex min-w-0 flex-1 flex-col px-3 pb-3 lg:px-6 lg:pb-4">
          <header className="flex shrink-0 items-center justify-between gap-3 py-4 lg:py-5">
            <div className="flex items-baseline gap-3">
              <h1 className="font-serif text-[30px] leading-none tracking-[0.035em] lg:text-[34px]">
                FORME<span className="text-coral">.</span>
              </h1>
              <span className="hidden h-4 w-px self-center bg-border sm:block" aria-hidden />
              <span className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground sm:block">
                The personal style studio
              </span>
            </div>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="hidden items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground lg:inline-flex"
            >
              How it works <ArrowUpRight className="size-3.5" aria-hidden />
            </button>
            <div className="flex items-center gap-1 lg:hidden">
              <Link to="/shop" aria-label="Shop all products" className={iconBtn}>
                <LayoutGrid className="size-[18px]" aria-hidden />
              </Link>
              <button
                type="button"
                onClick={() => setInfoOpen(true)}
                aria-label="How it works"
                className={iconBtn}
              >
                <Info className="size-[18px]" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => openLooks(false)}
                aria-label="Saved looks"
                className={iconBtn}
              >
                <Bookmark className="size-[18px]" aria-hidden />
              </button>
              {bag}
            </div>
          </header>
          <div className="mb-4 flex shrink-0 items-end justify-between gap-3 lg:mb-5">
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-coral" aria-hidden /> A little more you
              </div>
              <h2 className="font-serif text-[32px] leading-none tracking-[-0.02em] lg:text-[39px]">
                Your fitting room.
              </h2>
            </div>
            <p className="hidden max-w-[190px] pb-0.5 text-right text-xs leading-relaxed text-muted-foreground xl:block">
              Find your pieces.
              <br />
              Make the whole look yours.
            </p>
          </div>
          <div className="studio-stage-container min-h-0 flex-1">
            <StudioStage
              focus={focus}
              onFocus={setFocus}
              onSaveLook={() => openLooks(true)}
              onReplace={replace}
              onOpenOutfit={() => setOutfitOpen(true)}
            />
          </div>
          <div className="hidden shrink-0 items-center justify-between pt-3 text-[9px] uppercase tracking-[0.15em] text-muted-foreground lg:flex">
            <span>Considered pieces. Endless possibilities.</span>
            <span>Designed around you</span>
          </div>
        </main>

        <aside
          id="wardrobe"
          className="shrink-0 border-t border-border/70 bg-card/65 lg:h-svh lg:w-[350px] lg:border-l lg:border-t-0 xl:w-[376px]"
        >
          <div className="hidden h-full lg:block">
            <WardrobePanel
              ref={searchRef}
              variant="panel"
              category={category}
              onCategory={setCategory}
              query={query}
              onQuery={setQuery}
            />
          </div>
          <div className="lg:hidden">
            <WardrobePanel
              variant="tray"
              category={category}
              onCategory={setCategory}
              query={query}
              onQuery={setQuery}
            />
          </div>
        </aside>
      </div>

      <Sheet open={outfitOpen} onOpenChange={setOutfitOpen}>
        <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="font-serif text-2xl font-normal">Current outfit</SheetTitle>
          </SheetHeader>
          <div className="pt-3">
            <OutfitSummary variant="list" onReplace={replace} />
          </div>
        </SheetContent>
      </Sheet>
      <CartSheet open={cartOpen} onOpenChange={setCartOpen} />
      <LooksSheet open={looksOpen} onOpenChange={setLooksOpen} focusInput={looksFocus} />
      <HowItWorksDialog open={infoOpen} onOpenChange={setInfoOpen} />
    </div>
  );
}

export function FittingStudio() {
  return <Studio />;
}
