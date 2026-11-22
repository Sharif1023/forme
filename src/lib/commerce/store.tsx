import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { RefreshCw, ShoppingBag } from "lucide-react";
import { applyCatalogSnapshot } from "@/lib/forme/catalog";
import { api } from "./api";
import type { CommerceProduct, StoreSettings, Variant } from "./types";

interface CommerceContext {
  products: CommerceProduct[];
  variants: Variant[];
  settings: StoreSettings;
  refresh: () => Promise<void>;
}
const Context = createContext<CommerceContext | null>(null);

export function CommerceProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Omit<CommerceContext, "refresh"> | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const load = useCallback(async () => {
    const [catalog, settings] = await Promise.all([
      api<{ products: CommerceProduct[]; variants: Variant[] }>("/catalog"),
      api<StoreSettings>("/store/settings"),
    ]);
    applyCatalogSnapshot(catalog.products);
    setSnapshot({ products: catalog.products, variants: catalog.variants, settings });
    setError("");
  }, []);
  useEffect(() => {
    let active = true;
    void load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "The store is unavailable.");
    });
    const focus = () => {
      void load().catch(() => undefined);
    };
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      window.removeEventListener("focus", focus);
    };
  }, [retry, load]);
  if (!snapshot)
    return (
      <div className="commerce-loading">
        <span className="font-serif text-5xl">
          FORME<span className="text-coral">.</span>
        </span>
        {error ? (
          <>
            <p>{error}</p>
            <button
              type="button"
              className="commerce-primary"
              onClick={() => setRetry((value) => value + 1)}
            >
              <RefreshCw size={16} /> Try again
            </button>
            <a href="/admin" className="text-sm underline">
              Store administration
            </a>
          </>
        ) : (
          <p>
            <ShoppingBag className="inline size-4 animate-pulse" /> Opening your wardrobe…
          </p>
        )}
      </div>
    );
  return <Context.Provider value={{ ...snapshot, refresh: load }}>{children}</Context.Provider>;
}
export function useCommerce() {
  const context = useContext(Context);
  if (!context) throw new Error("CommerceProvider is required");
  return context;
}
