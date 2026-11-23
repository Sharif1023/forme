import { useMemo, useState } from "react";
import { ArrowUpRight, Check, Plus, Search, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { StoreShell } from "@/components/commerce/StoreShell";
import { GarmentThumb } from "@/components/forme/GarmentThumb";
import { useStudio } from "@/components/forme/store";
import { useCommerce } from "@/lib/commerce/store";
import { money } from "@/lib/commerce/api";
import type { CommerceProduct } from "@/lib/commerce/types";
import { CATEGORY_LABEL, canPreviewProduct, defaultSize } from "@/lib/forme/catalog";

export default function ShopPage() {
  const { products } = useCommerce();
  const [gender, setGender] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("curated");
  const items = useMemo(
    () =>
      products
        .filter(
          (product) =>
            product.active &&
            (gender === "all" || product.gender === gender) &&
            (category === "all" || product.category === category) &&
            `${product.name} ${product.description}`.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "price-asc"
            ? a.pricePaise - b.pricePaise
            : sort === "price-desc"
              ? b.pricePaise - a.pricePaise
              : sort === "name"
                ? a.name.localeCompare(b.name)
                : 0,
        ),
    [products, gender, category, search, sort],
  );
  return (
    <StoreShell>
      <div className="commerce-container">
        <div className="shop-intro">
          <div>
            <p className="commerce-eyebrow">The everyday collection</p>
            <h1 className="commerce-title">A wardrobe, considered.</h1>
            <p className="commerce-subtitle">
              Good pieces. Real textures. Endless ways to wear them.
            </p>
          </div>
          <Link to="/" className="commerce-secondary">
            Find your look in the studio <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="shop-toolbar">
          <div className="shop-chips" role="group" aria-label="Collection">
            {[
              ["all", "Everyone"],
              ["women", "Womenswear"],
              ["men", "Menswear"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={gender === id}
                className={gender === id ? "is-selected" : ""}
                onClick={() => setGender(id!)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="shop-search">
            <Search size={16} />
            <span className="sr-only">Search products</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search the collection"
            />
          </label>
        </div>
        <div className="shop-filter-row">
          <div className="shop-chips" role="group" aria-label="Product categories">
            {[["all", "All pieces"], ...Object.entries(CATEGORY_LABEL)].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={category === id}
                className={category === id ? "is-selected" : ""}
                onClick={() => setCategory(id!)}
              >
                {label}
              </button>
            ))}
          </div>
          <label>
            <span className="sr-only">Sort products</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="curated">Curated for you</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name: A–Z</option>
            </select>
          </label>
        </div>
        <p className="shop-count" role="status">
          {items.length} considered {items.length === 1 ? "piece" : "pieces"}
        </p>
        <div className="shop-product-grid">
          {items.map((product) => (
            <ShopCard key={product.id} product={product} />
          ))}
        </div>
        {!items.length && (
          <div className="commerce-empty">
            <Search size={30} />
            <h2>No pieces found</h2>
            <p>Try a different word or explore another collection.</p>
            <button
              type="button"
              className="commerce-secondary"
              onClick={() => {
                setSearch("");
                setCategory("all");
                setGender("all");
              }}
            >
              Show all pieces
            </button>
          </div>
        )}
      </div>
    </StoreShell>
  );
}

function ShopCard({ product }: { product: CommerceProduct }) {
  const { variants } = useCommerce();
  const { dispatch } = useStudio();
  const [colorId, setColorId] = useState(product.colors[0]?.id ?? "default");
  const [size, setSize] = useState(defaultSize(product));
  const [added, setAdded] = useState(false);
  const color = product.colors.find((option) => option.id === colorId) ?? product.colors[0]!;
  const sizes = product.sizes?.length
    ? product.sizes
    : [
        ...new Set(
          variants
            .filter((variant) => variant.productId === product.id)
            .map((variant) => variant.size),
        ),
      ];
  const variant = variants.find(
    (candidate) =>
      candidate.productId === product.id &&
      candidate.colorId === colorId &&
      candidate.size === size,
  );
  const available = !!variant && variant.stock > 0 && variant.active !== false;
  return (
    <article className="shop-product">
      <div className="shop-product-image">
        <GarmentThumb
          product={product}
          hex={color.hex}
          colorId={colorId}
          className="h-full w-full"
        />
        <span className="shop-product-label">
          {product.gender === "men" ? "Menswear" : "Womenswear"}
        </span>
        {!available && (
          <span className="shop-stock-label">{variant ? "Sold out" : "Select a size"}</span>
        )}
      </div>
      <div className="shop-product-meta">
        <span>{CATEGORY_LABEL[product.category]}</span>
        <h2>{product.name}</h2>
        <p>{product.description}</p>
        <strong>{money(variant?.pricePaise ?? product.pricePaise)}</strong>
        <div className="shop-product-options">
          <div className="shop-swatches" role="group" aria-label={`${product.name} colours`}>
            {product.colors.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.name}
                aria-label={`${product.name} in ${option.name}`}
                aria-pressed={option.id === colorId}
                style={{ background: option.hex }}
                onClick={() => setColorId(option.id)}
                className={option.id === colorId ? "is-selected" : ""}
              />
            ))}
          </div>
          <label>
            <span className="sr-only">{product.name} size</span>
            <select value={size} onChange={(event) => setSize(event.target.value)}>
              {!sizes.includes(size) && <option value={size}>Select size</option>}
              {sizes.map((option) => (
                <option key={option} value={option}>
                  {product.category === "shoes" ? `US ${option}` : option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="commerce-secondary w-full"
          disabled={!available}
          onClick={() => {
            dispatch({ type: "addToCart", selection: { productId: product.id, colorId, size } });
            setAdded(true);
            setTimeout(() => setAdded(false), 1800);
            toast(`${product.name} added to bag`, { description: `${color.name} · ${size}` });
          }}
        >
          {added ? <Check size={15} /> : <Plus size={15} />}{" "}
          {added ? "Added to your bag" : available ? "Add to bag" : "Currently unavailable"}
          <ShoppingBag size={14} />
        </button>
        {canPreviewProduct(product) && (
          <Link
            className="shop-try-on"
            to={`/?try=${encodeURIComponent(product.id)}&color=${encodeURIComponent(colorId)}&size=${encodeURIComponent(size)}`}
          >
            Try in fitting room <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
    </article>
  );
}
