import { failure, useAdminData } from "./data";
import { useMemo, useState } from "react";
import { Plus, Search, Trash2, Upload, Package } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "@/lib/commerce/api";
import type { AdminUser, AdminProduct, AdminVariant } from "./types";
import { canManage } from "./types";
import { PageHead, Loading, ErrorBox, Empty, Modal, Status } from "./shared";
import { ProductTryOnModal } from "./AdminTryOn";

interface Catalog {
  products: AdminProduct[];
  variants: AdminVariant[];
}
type ProductDraft = Omit<AdminProduct, "id" | "sizes" | "pricePaise"> & {
  id?: string;
  sizesText: string;
  price: string;
};
const newDraft = (): ProductDraft => ({
  name: "",
  description: "",
  gender: "women",
  category: "tshirts",
  price: "",
  active: true,
  imageUrl: "",
  colors: [{ id: "black", name: "Black", hex: "#242424" }],
  sizesText: "S, M, L, XL",
});
const productImage = (product: AdminProduct) =>
  product.imageUrl ||
  (product.studioSupported && product.colors[0]
    ? `/images/products/${product.id}--${product.colors[0].id}.webp`
    : "");

export function AdminProducts({ admin }: { admin: AdminUser }) {
  const { data, loading, error, reload } = useAdminData<Catalog>("/admin/products");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [visibility, setVisibility] = useState("");
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [archiving, setArchiving] = useState<AdminProduct | null>(null);
  const [previewProduct, setPreviewProduct] = useState<AdminProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const products = useMemo(
    () =>
      (data?.products || []).filter(
        (product) =>
          (!search ||
            `${product.name} ${product.id}`.toLowerCase().includes(search.toLowerCase())) &&
          (!category || product.category === category) &&
          (!visibility || product.active === (visibility === "active")),
      ),
    [data, search, category, visibility],
  );
  const editable = canManage(admin);
  function open(product?: AdminProduct) {
    setFormError("");
    setDraft(
      product
        ? {
            ...product,
            sizesText: product.sizes.join(", "),
            price: String(product.pricePaise / 100),
            colors: product.colors.map((color) => ({ ...color })),
          }
        : newDraft(),
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setFormError("");
    const sizes = draft.sizesText
      .split(",")
      .map((size) => size.trim())
      .filter(Boolean);
    if (!sizes.length || new Set(sizes).size !== sizes.length) {
      setFormError("Add at least one size, with no duplicates.");
      return;
    }
    if (new Set(draft.colors.map((color) => color.id)).size !== draft.colors.length) {
      setFormError("Each colour needs a unique ID.");
      return;
    }
    setBusy(true);
    try {
      const { price, sizesText, studioSupported, tryOn, ...product } = draft;
      await api(`/admin/products${draft.id ? `/${encodeURIComponent(draft.id)}` : ""}`, {
        method: draft.id ? "PATCH" : "POST",
        body: JSON.stringify({ ...product, sizes, pricePaise: Math.round(Number(price) * 100) }),
      });
      toast.success(
        draft.id
          ? "Product updated"
          : "Product created. Add stock in Inventory and configure its fitting preview photos.",
      );
      setDraft(null);
      reload();
    } catch (reason) {
      setFormError(failure(reason));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setFormError("Choose a PNG, JPEG or WebP image under 5 MB.");
      return;
    }
    setUploading(true);
    setFormError("");
    try {
      const result = await api<{ url: string }>("/admin/uploads", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      setDraft((current) => (current ? { ...current, imageUrl: result.url } : current));
      toast.success("Image uploaded");
    } catch (reason) {
      setFormError(failure(reason));
    } finally {
      setUploading(false);
    }
  }
  async function archive() {
    if (!archiving) return;
    setBusy(true);
    setFormError("");
    try {
      await api(`/admin/products/${encodeURIComponent(archiving.id)}`, { method: "DELETE" });
      toast.success("Product archived");
      setArchiving(null);
      reload();
    } catch (reason) {
      setFormError(failure(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        title="Your collection"
        description="Thoughtfully chosen pieces, ready for your customers."
      >
        {editable && (
          <button className="admin-button admin-button-primary" onClick={() => open()}>
            <Plus size={15} />
            Add product
          </button>
        )}
      </PageHead>
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={15} />
          <input
            className="admin-input"
            aria-label="Search products"
            placeholder="Search your collection…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          className="admin-input"
          aria-label="Filter category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          <option value="tshirts">T-shirts</option>
          <option value="shirts">Shirts</option>
          <option value="pants">Pants</option>
          <option value="shoes">Shoes</option>
        </select>
        <select
          className="admin-input"
          aria-label="Filter visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
        >
          <option value="">All visibility</option>
          <option value="active">Published</option>
          <option value="inactive">Archived</option>
        </select>
        <span className="admin-result-count">{products.length} products</span>
      </div>
      <ErrorBox error={error} retry={reload} />
      {loading ? (
        <Loading />
      ) : (
        <section className="admin-card">
          {products.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Variants</th>
                    <th>Available</th>
                    <th>Visibility</th>
                    <th>Fitting room</th>
                    {editable && <th>Manage</th>}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const variants =
                      data?.variants.filter(
                        (variant) => variant.productId === product.id && variant.active,
                      ) || [];
                    const image = productImage(product);
                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="admin-product-cell">
                            {image ? (
                              <img src={image} alt="" loading="lazy" />
                            ) : (
                              <span className="admin-image-placeholder">
                                <Package size={20} />
                              </span>
                            )}
                            <div>
                              <strong>{product.name}</strong>
                              <small>
                                {product.gender} ·{" "}
                                {product.category === "tshirts" ? "T-shirts" : product.category}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>{money(product.pricePaise)}</td>
                        <td>
                          {product.colors.length} colours · {product.sizes.length} sizes
                        </td>
                        <td>{variants.reduce((sum, variant) => sum + variant.available, 0)}</td>
                        <td>
                          <Status value={product.active ? "active" : "inactive"} />
                        </td>
                        <td><span className={`admin-pill${product.studioSupported || product.tryOn?.ready ? " admin-pill-good" : ""}`}>{product.studioSupported ? "Prepared" : product.tryOn?.ready ? "AI ready" : product.tryOn?.enabled ? "Photos needed" : "Not set up"}</span></td>
                        {editable && (
                          <td>
                            <div className="admin-row-actions">
                              <button className="admin-small-button" onClick={() => open(product)}>
                                Edit
                              </button>
                              <button className="admin-small-button" onClick={() => setPreviewProduct(product)}>
                                Fitting preview
                              </button>
                              {product.active && (
                                <button
                                  className="admin-small-button"
                                  onClick={() => {
                                    setFormError("");
                                    setArchiving(product);
                                  }}
                                >
                                  Archive
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Room for something wonderful">
              {search || category || visibility
                ? "No products match these filters."
                : "Add your first piece to start building your collection."}
            </Empty>
          )}
        </section>
      )}
      {draft && (
        <Modal
          title={draft.id ? "Edit product" : "A new addition"}
          description="Set the details, colours and sizes. Stock is managed separately in Inventory."
          onClose={() => {
            if (!busy && !uploading) setDraft(null);
          }}
        >
          <form onSubmit={save}>
            <ErrorBox error={formError} />
            <div className="admin-form-grid">
              <label className="admin-field admin-span-2">
                Product name
                <input
                  required
                  maxLength={180}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className="admin-field">
                Collection
                <select
                  value={draft.gender}
                  onChange={(e) =>
                    setDraft({ ...draft, gender: e.target.value as AdminProduct["gender"] })
                  }
                >
                  <option value="women">Women</option>
                  <option value="men">Men</option>
                </select>
              </label>
              <label className="admin-field">
                Category
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value as AdminProduct["category"] })
                  }
                >
                  <option value="tshirts">T-shirts</option>
                  <option value="shirts">Shirts</option>
                  <option value="pants">Pants</option>
                  <option value="shoes">Shoes</option>
                </select>
              </label>
              <label className="admin-field">
                Price (BDT)
                <input
                  required
                  type="number"
                  min="0.01"
                  max="10000000"
                  step="0.01"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </label>
              <label className="admin-field">
                Sizes, separated by commas
                <input
                  required
                  maxLength={900}
                  value={draft.sizesText}
                  onChange={(e) => setDraft({ ...draft, sizesText: e.target.value })}
                  placeholder="S, M, L, XL"
                />
              </label>
              <label className="admin-field admin-span-2">
                Description
                <textarea
                  maxLength={10000}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </label>
              <div className="admin-field admin-span-2">
                Product image
                <div className="admin-upload-row">
                  {draft.imageUrl && (
                    <img
                      className="admin-upload-preview"
                      src={draft.imageUrl}
                      alt="Product preview"
                    />
                  )}
                  <div>
                    <label className="admin-button">
                      <Upload size={14} />
                      {uploading ? "Uploading…" : "Upload image"}
                      <input
                        className="admin-visually-hidden"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploading || busy}
                        onChange={(e) => {
                          void upload(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <p className="admin-section-note">PNG, JPEG or WebP · up to 5 MB</p>
                  </div>
                </div>
                <input
                  aria-label="Image URL"
                  placeholder="Or paste an HTTPS image URL"
                  value={draft.imageUrl || ""}
                  maxLength={1024}
                  onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
                />
                {draft.imageUrl && (
                  <button
                    type="button"
                    className="admin-text-link admin-clear-image"
                    onClick={() => setDraft({ ...draft, imageUrl: "" })}
                  >
                    Remove image
                  </button>
                )}
              </div>
              <div className="admin-field admin-span-2">
                Colour variants
                <div className="admin-colors">
                  {draft.colors.map((color, index) => (
                    <div className="admin-color-row" key={index}>
                      <input
                        aria-label={`Colour ${index + 1} ID`}
                        required
                        pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*"
                        maxLength={128}
                        placeholder="Colour ID"
                        value={color.id}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            colors: draft.colors.map((item, i) =>
                              i === index ? { ...item, id: e.target.value } : item,
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={`Colour ${index + 1} name`}
                        required
                        maxLength={100}
                        placeholder="Name"
                        value={color.name}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            colors: draft.colors.map((item, i) =>
                              i === index ? { ...item, name: e.target.value } : item,
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={`Colour ${index + 1} swatch`}
                        type="color"
                        value={color.hex}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            colors: draft.colors.map((item, i) =>
                              i === index ? { ...item, hex: e.target.value } : item,
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="admin-icon-button"
                        disabled={draft.colors.length === 1}
                        aria-label={`Remove ${color.name || "colour"}`}
                        onClick={() =>
                          setDraft({ ...draft, colors: draft.colors.filter((_, i) => i !== index) })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="admin-button admin-add-color"
                  disabled={draft.colors.length >= 30}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      colors: [...draft.colors, { id: "", name: "", hex: "#c8b9a6" }],
                    })
                  }
                >
                  <Plus size={13} />
                  Add colour
                </button>
                <small>
                  IDs connect existing stock to colours. Changing an ID creates a new variant.
                  Removing a size or colour archives its variants.
                </small>
                {draft.studioSupported && (
                  <p className="admin-secret-note">
                    This piece has a prepared studio preview. Changing its collection, category or
                    colour swatches turns off that preview. Product photos will still appear in the
                    store.
                  </p>
                )}
              </div>
              <label className="admin-checkbox admin-span-2">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                Publish this product
              </label>
            </div>
            <div className="admin-form-footer">
              <button
                type="button"
                className="admin-button"
                onClick={() => setDraft(null)}
                disabled={busy || uploading}
              >
                Cancel
              </button>
              <button className="admin-button admin-button-primary" disabled={busy || uploading}>
                {busy ? "Saving…" : "Save product"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {previewProduct && <ProductTryOnModal product={previewProduct} onClose={() => setPreviewProduct(null)} onSaved={reload} />}
      {archiving && (
        <Modal
          title="Archive this product?"
          description={`${archiving.name} will be hidden from the store. Existing order records remain available.`}
          onClose={() => {
            if (!busy) setArchiving(null);
          }}
        >
          <ErrorBox error={formError} />
          <p className="admin-danger-copy">
            You can publish this product again from the product editor.
          </p>
          <div className="admin-form-footer">
            <button className="admin-button" disabled={busy} onClick={() => setArchiving(null)}>
              Keep product
            </button>
            <button className="admin-button admin-button-danger" disabled={busy} onClick={archive}>
              {busy ? "Archiving…" : "Archive product"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
