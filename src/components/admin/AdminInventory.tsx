import { failure, useAdminData } from "./data";
import { useMemo, useState } from "react";
import { Search, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/commerce/api";
import type { AdminUser, AdminVariant } from "./types";
import { canManage } from "./types";
import { PageHead, Loading, ErrorBox, Empty, Status } from "./shared";

interface VariantDraft {
  stock: number;
  pricePaise: number;
  sku: string;
  active: boolean;
}
export function AdminInventory({ admin }: { admin: AdminUser }) {
  const { data, loading, error, reload, setData } = useAdminData<{ variants: AdminVariant[] }>(
    "/admin/inventory",
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [drafts, setDrafts] = useState<Record<string, VariantDraft>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const editable = canManage(admin);
  const variants = useMemo(
    () =>
      (data?.variants || []).filter(
        (variant) =>
          (!search ||
            `${variant.productName} ${variant.sku} ${variant.colorName} ${variant.size}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (filter === "all" ||
            (filter === "active"
              ? variant.active
              : filter === "low"
                ? variant.active && variant.available <= 5
                : !variant.active)),
      ),
    [data, search, filter],
  );
  function change(variant: AdminVariant, patch: Partial<VariantDraft>) {
    setDrafts((current) => ({
      ...current,
      [variant.id]: {
        stock: variant.stock,
        pricePaise: variant.pricePaise,
        sku: variant.sku,
        active: variant.active,
        ...current[variant.id],
        ...patch,
      },
    }));
  }
  async function save(ids = Object.keys(drafts)) {
    setSaveError("");
    for (const id of ids) {
      const draft = drafts[id];
      const variant = data?.variants.find((item) => item.id === id);
      if (!draft || !variant) continue;
      const label = `${variant.productName} · ${variant.colorName} · ${variant.size}`;
      if (
        !Number.isInteger(draft.stock) ||
        draft.stock < variant.reserved ||
        draft.stock > 10000000
      ) {
        setSaveError(
          `${label}: enter a whole stock quantity between ${variant.reserved} reserved and 10,000,000.`,
        );
        return;
      }
      if (
        !Number.isInteger(draft.pricePaise) ||
        draft.pricePaise < 1 ||
        draft.pricePaise > 1000000000
      ) {
        setSaveError(`${label}: enter a price between BDT 0.01 and BDT 10,000,000.`);
        return;
      }
      if (!draft.sku.trim()) {
        setSaveError(`${label}: add a SKU before saving.`);
        return;
      }
    }
    setBusy(true);
    let saved = 0;
    try {
      for (const id of ids) {
        const draft = drafts[id];
        if (!draft) continue;
        const result = await api<{ variant: AdminVariant }>(
          `/admin/inventory/${encodeURIComponent(id)}`,
          { method: "PATCH", body: JSON.stringify(draft) },
        );
        setData((current) =>
          current
            ? {
                variants: current.variants.map((variant) =>
                  variant.id === id ? { ...variant, ...result.variant } : variant,
                ),
              }
            : current,
        );
        setDrafts((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        saved++;
      }
      toast.success(`${saved} variant${saved === 1 ? "" : "s"} updated`);
    } catch (reason) {
      setSaveError(`${saved ? `${saved} saved. ` : ""}${failure(reason)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        title="Inventory, in order"
        description="Keep every colour and size ready for its next owner."
      >
        {editable && (
          <button
            className="admin-button admin-button-primary"
            disabled={busy || !Object.keys(drafts).length}
            onClick={() => save()}
          >
            <Save size={14} />
            {busy
              ? "Saving…"
              : `Save changes${Object.keys(drafts).length ? ` (${Object.keys(drafts).length})` : ""}`}
          </button>
        )}
      </PageHead>
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={15} />
          <input
            className="admin-input"
            aria-label="Search inventory"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product, colour, size or SKU…"
          />
        </label>
        <select
          className="admin-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter stock"
        >
          <option value="active">Active variants</option>
          <option value="low">Low stock · 5 or fewer</option>
          <option value="inactive">Inactive variants</option>
          <option value="all">All variants</option>
        </select>
        <span className="admin-result-count">{variants.length} variants</span>
      </div>
      <ErrorBox error={error} retry={reload} />
      <ErrorBox error={saveError} />
      {Object.keys(drafts).length > 0 && (
        <p className="admin-secret-note">
          You have unsaved inventory changes. Stock is the total on hand; reserved items are already
          held for current orders.{" "}
          <button className="admin-text-link" disabled={busy} onClick={() => setDrafts({})}>
            Discard changes
          </button>
        </p>
      )}
      {loading ? (
        <Loading />
      ) : (
        <section className="admin-card">
          {variants.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>SKU</th>
                    <th>Price (BDT)</th>
                    <th>On hand</th>
                    <th>Reserved</th>
                    <th>Available</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant) => {
                    const value = drafts[variant.id] || variant;
                    return (
                      <tr key={variant.id} className={drafts[variant.id] ? "admin-dirty" : ""}>
                        <td>
                          <strong>{variant.productName}</strong>
                          <small>
                            <span className="admin-swatch" style={{ background: variant.hex }} />
                            {variant.colorName} · {variant.size}
                          </small>
                        </td>
                        <td>
                          <input
                            className="admin-input admin-sku-input"
                            aria-label={`SKU for ${variant.productName} ${variant.colorName} ${variant.size}`}
                            value={value.sku}
                            disabled={!editable || busy}
                            maxLength={180}
                            onChange={(e) => change(variant, { sku: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="admin-input admin-inventory-number"
                            type="number"
                            aria-label={`Price for ${variant.sku}`}
                            min="0.01"
                            step="0.01"
                            max="10000000"
                            value={value.pricePaise / 100}
                            disabled={!editable || busy}
                            onChange={(e) =>
                              change(variant, {
                                pricePaise: Math.round(Number(e.target.value) * 100),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="admin-input admin-inventory-number"
                            type="number"
                            aria-label={`Stock for ${variant.sku}`}
                            min={variant.reserved}
                            step="1"
                            max="10000000"
                            value={value.stock}
                            disabled={!editable || busy}
                            onChange={(e) => change(variant, { stock: Number(e.target.value) })}
                          />
                        </td>
                        <td>{variant.reserved}</td>
                        <td>
                          <Status value={String(value.stock - variant.reserved)} />
                          {value.stock - variant.reserved <= 5 && <small>Low stock</small>}
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Active ${variant.sku}`}
                            checked={value.active}
                            disabled={!editable || busy}
                            onChange={(e) => change(variant, { active: e.target.checked })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Everything has its place">
              No variants match these filters. Add a product to create its colour and size variants.
            </Empty>
          )}
          <p className="admin-section-note">
            Inventory changes are recorded in the activity log. Existing reservations cannot be
            reduced below their reserved quantity.
          </p>
        </section>
      )}
    </>
  );
}
