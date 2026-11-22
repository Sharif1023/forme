import { Link, NavLink } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { CartSheet } from "@/components/forme/CartSheet";
import { useStudio } from "@/components/forme/store";
import { cartCount } from "@/lib/forme/state";
import { useCommerce } from "@/lib/commerce/store";

export function StoreShell({ children }: { children: ReactNode }) {
  const [bag, setBag] = useState(false);
  const { state } = useStudio();
  const { settings } = useCommerce();
  return (
    <div className="store-shell">
      {settings.shop.announcement && (
        <div className="store-announcement">{settings.shop.announcement}</div>
      )}
      <header className="store-header">
        <Link to="/" className="store-wordmark">
          {settings.shop.name || "FORME"}
          <span>.</span>
        </Link>
        <nav aria-label="Store navigation">
          <NavLink to="/" end>
            Fitting studio
          </NavLink>
          <NavLink to="/shop">The collection</NavLink>
          <NavLink to="/track">Track order</NavLink>
        </nav>
        <button
          type="button"
          className="store-bag"
          onClick={() => setBag(true)}
          aria-label={`Open bag, ${cartCount(state.cart)} items`}
        >
          <ShoppingBag size={18} />
          <span className="hidden sm:inline">My bag</span>
          <span className="store-count">{cartCount(state.cart)}</span>
        </button>
      </header>
      <main>{children}</main>
      <footer className="store-footer">
        <span className="font-serif text-3xl">FORME.</span>
        <p>Considered pieces. Made to be yours.</p>
        <div>
          {settings.shop.phone && <a href={`tel:${settings.shop.phone}`}>{settings.shop.phone}</a>}
          {settings.shop.email && (
            <a href={`mailto:${settings.shop.email}`}>{settings.shop.email}</a>
          )}
          <Link to="/admin">
            Store administration <ArrowUpRight size={12} />
          </Link>
        </div>
        <small>© {new Date().getFullYear()} FORME · Bangladesh</small>
      </footer>
      <CartSheet open={bag} onOpenChange={setBag} />
    </div>
  );
}
