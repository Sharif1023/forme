import { forwardRef, useState } from "react";
import { ArrowDownUp, Search, SearchX, Shuffle, X } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_LABEL, filterProducts, type CategoryFilter } from "@/lib/forme/catalog";
import { nextStyledLook } from "@/lib/forme/styled-looks";
import { cn } from "@/lib/utils";
import { ProductCard } from "./ProductCard";
import { useStudio } from "./store";

const FILTERS: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tshirts", label: CATEGORY_LABEL.tshirts },
  { id: "shirts", label: CATEGORY_LABEL.shirts },
  { id: "pants", label: CATEGORY_LABEL.pants },
  { id: "shoes", label: CATEGORY_LABEL.shoes },
];

interface Props {
  variant: "panel" | "tray";
  category: CategoryFilter;
  onCategory: (c: CategoryFilter) => void;
  query: string;
  onQuery: (q: string) => void;
}

export const WardrobePanel = forwardRef<HTMLInputElement, Props>(function WardrobePanel(
  { variant, category, onCategory, query, onQuery },
  searchRef,
) {
  const { state, dispatch } = useStudio();
  const [sort, setSort] = useState("curated");
  const items = [...filterProducts(state.gender, category, query)].sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    if (sort === "name") return a.name.localeCompare(b.name);
    return 0;
  });
  const tray = variant === "tray";

  const styleLook = (
    <button
      type="button"
      onClick={() => {
        const look = nextStyledLook(state.gender, state.outfits[state.gender]);
        dispatch({ type: "applyOutfit", outfit: look.outfit });
        toast(look.name, { description: "Three pieces, thoughtfully paired." });
      }}
      title="Try the next coordinated outfit"
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-coral/30 bg-coral-soft/50 px-3 text-[10px] font-medium text-coral transition hover:border-coral hover:bg-coral-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Shuffle className="size-3" aria-hidden />
      Style a look
    </button>
  );

  const chips = (
    <div
      className={cn("flex gap-1.5 overflow-x-auto scrollbar-none", tray && "px-4")}
      role="group"
      aria-label="Categories"
    >
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onCategory(f.id)}
          aria-pressed={category === f.id}
          className={cn(
            "h-8 shrink-0 rounded-full border px-3 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            category === f.id
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-card text-foreground hover:border-studio-deep",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  const search = (
    <label className={cn("relative block", tray && "px-4")}>
      <span className="sr-only">Search the wardrobe</span>
      <Search
        className={cn(
          "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
          tray ? "left-7" : "left-3",
        )}
        aria-hidden
      />
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Find your next favourite…"
        className="h-10 w-full rounded-xl border border-input/70 bg-background/65 pl-9 pr-9 text-[12px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQuery("")}
          aria-label="Clear search"
          className={cn(
            "absolute top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground",
            tray ? "right-5" : "right-1.5",
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </label>
  );

  const sorting = (
    <div className={cn("flex items-center justify-between gap-2", tray && "px-4")}>
      <span className="text-[10px] text-muted-foreground" aria-live="polite">
        {items.length} {items.length === 1 ? "piece" : "pieces"} to make it yours
      </span>
      <label className="flex min-w-0 items-center gap-1 text-[10px] text-foreground">
        <ArrowDownUp className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">Sort wardrobe</span>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="max-w-[128px] cursor-pointer rounded-md border-0 bg-transparent py-1 pr-1 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="curated">Curated for you</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          <option value="name">Name: A to Z</option>
        </select>
      </label>
    </div>
  );

  const empty = (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-studio-deep/60 text-center",
        tray ? "mx-4 py-6" : "py-14",
      )}
      role="status"
    >
      <SearchX className="size-6 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-serif text-xl text-foreground">Nothing matches yet</p>
      <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
        Try another word, or browse the full wardrobe.
      </p>
      <button
        type="button"
        onClick={() => {
          onQuery("");
          onCategory("all");
        }}
        className="mt-4 h-8 rounded-full bg-foreground px-4 text-xs font-medium text-background hover:bg-foreground/90"
      >
        Show all pieces
      </button>
    </div>
  );

  if (tray) {
    return (
      <section aria-label="Wardrobe" className="space-y-3 py-3">
        <div className="flex items-center justify-between px-4">
          <h2 className="font-serif text-2xl">The wardrobe</h2>
          {styleLook}
        </div>
        {search}
        {chips}
        {sorting}
        {items.length === 0 ? (
          empty
        ) : (
          <div className="flex gap-2.5 overflow-x-auto scrollbar-none px-4 pb-1">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} compact />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Wardrobe" className="flex h-full min-h-0 flex-col">
      <div className="space-y-4 border-b border-border/65 px-5 pb-4 pt-6">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.22em] text-coral">
              The everyday collection
            </p>
            <h2 className="font-serif text-[32px] leading-none text-foreground">Your wardrobe.</h2>
          </div>
          <span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
            {state.gender === "men" ? "Menswear" : "Womenswear"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Good pieces. Endless possibilities.
          </p>
          {styleLook}
        </div>
        {search}
        {chips}
        {sorting}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
        {items.length === 0 ? (
          empty
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});
