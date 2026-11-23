import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, money } from "@/lib/commerce/api";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  canManage,
  type AdminCoupon,
  type AdminCustomer,
  type AdminRole,
  type AdminUser,
  type AuditEntry,
  type StaffMember,
} from "./types";

const PAGE_SIZE = 25;
const errorMessage = (reason: unknown) =>
  reason instanceof Error
    ? reason.message
    : "The request could not be completed. Please try again.";
const displayDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })
    : "—";

function useRecords<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason) => {
        if (!active) return;
        setError(errorMessage(reason));
        if (reason instanceof ApiError && reason.status === 401)
          window.dispatchEvent(new Event("admin-session-expired"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, loading, error, refresh: () => setVersion((value) => value + 1) };
}

function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="admin-page-head">
      <div>
        <p className="admin-eyebrow">Your store, considered</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}

function DataState({
  loading,
  error,
  empty,
  refresh,
  children,
}: {
  loading: boolean;
  error: string;
  empty: string | false;
  refresh: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="admin-empty" role="status">
        <span className="admin-spinner" /> <p>Loading your records…</p>
      </div>
    );
  if (error)
    return (
      <div className="admin-alert" role="alert">
        {error}{" "}
        <button className="admin-small-button" type="button" onClick={refresh}>
          Try again
        </button>
      </div>
    );
  if (empty)
    return (
      <div className="admin-empty">
        <strong>Nothing here yet.</strong>
        {empty}
      </div>
    );
  return <>{children}</>;
}

function Pages({
  page,
  count,
  loading,
  onChange,
}: {
  page: number;
  count: number;
  loading: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="admin-pagination">
      <button
        type="button"
        className="admin-small-button"
        disabled={page === 1 || loading}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span>Page {page}</span>
      <button
        type="button"
        className="admin-small-button"
        disabled={count < PAGE_SIZE || loading}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

function ManagementModal({
  open,
  title,
  description,
  onClose,
  children,
  busy = false,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent className="admin-modal-content">
        <div className="admin-app" style={{ minHeight: 0, background: "transparent" }}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="admin-section-note">{description}</DialogDescription>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminCustomers() {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const result = useRecords<{ customers: AdminCustomer[]; page: number }>(
    `/admin/customers?page=${page}&limit=${PAGE_SIZE}&search=${encodeURIComponent(search)}`,
  );
  const rows = result.data?.customers ?? [];
  return (
    <>
      <Heading
        title="The people behind the orders."
        description="Customer contact details and purchase history, all in one place."
      />
      <section className="admin-card">
        <form
          className="admin-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(draft.trim());
            setPage(1);
          }}
        >
          <input
            className="admin-input"
            type="search"
            aria-label="Search customers"
            placeholder="Name, phone or email"
            value={draft}
            maxLength={180}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="admin-button" type="submit">
            <Search size={14} />
            Search
          </button>
          <button
            className="admin-button"
            type="button"
            onClick={result.refresh}
            disabled={result.loading}
            aria-label="Refresh customers"
          >
            <RefreshCw size={14} />
          </button>
        </form>
        <DataState
          {...result}
          empty={
            rows.length
              ? false
              : search
                ? "No customers match your search. Try another name, phone or email."
                : "Customers appear here after their first order."
          }
        >
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Orders</th>
                  <th>Paid purchases</th>
                  <th>First seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.name}</strong>
                    </td>
                    <td>
                      <a href={`tel:${customer.phone}`} className="admin-text-link">
                        {customer.phone}
                      </a>
                      {customer.email && (
                        <small>
                          <a href={`mailto:${customer.email}`}>{customer.email}</a>
                        </small>
                      )}
                    </td>
                    <td>{customer.orderCount}</td>
                    <td>{money(customer.totalSpentPaise)}</td>
                    <td>{displayDate(customer.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
        <Pages page={page} count={rows.length} loading={result.loading} onChange={setPage} />
      </section>
    </>
  );
}

export function AdminAudit() {
  const [page, setPage] = useState(1);
  const result = useRecords<{ logs: AuditEntry[]; page: number }>(
    `/admin/audit?page=${page}&limit=${PAGE_SIZE}`,
  );
  const rows = result.data?.logs ?? [];
  return (
    <>
      <Heading
        title="Every action, accounted for."
        description="A dated record of staff actions across the store."
      >
        <button
          type="button"
          className="admin-button"
          disabled={result.loading}
          onClick={result.refresh}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </Heading>
      <section className="admin-card">
        <DataState
          {...result}
          empty={rows.length ? false : "Staff actions will appear here as the store is managed."}
        >
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Staff member</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id}>
                    <td>{displayDate(entry.createdAt)}</td>
                    <td>
                      {entry.actorName || "System"}
                      {entry.ipAddress && <small>{entry.ipAddress}</small>}
                    </td>
                    <td>{entry.action.replaceAll(".", " · ").replaceAll("_", " ")}</td>
                    <td>
                      {entry.entityType}
                      <small
                        style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}
                        title={entry.entityId}
                      >
                        {entry.entityId || "Store settings"}
                      </small>
                    </td>
                    <td>
                      {Object.keys(entry.metadata ?? {}).length ? (
                        <details>
                          <summary style={{ cursor: "pointer", color: "#9e654c" }}>
                            View details
                          </summary>
                          <pre
                            style={{
                              maxWidth: 300,
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                              fontSize: 10,
                              marginTop: 10,
                            }}
                          >
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
        <Pages page={page} count={rows.length} loading={result.loading} onChange={setPage} />
      </section>
    </>
  );
}

interface CouponForm {
  id?: string;
  code: string;
  type: "percent" | "fixed";
  value: string;
  minimum: string;
  maximum: string;
  usageLimit: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
}
const localDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const newCoupon = (): CouponForm => ({
  code: "",
  type: "percent",
  value: "10",
  minimum: "0",
  maximum: "",
  usageLimit: "",
  startsAt: "",
  endsAt: "",
  active: true,
});
const couponForm = (coupon: AdminCoupon): CouponForm => ({
  id: coupon.id,
  code: coupon.code,
  type: coupon.type,
  value: String(coupon.type === "fixed" ? coupon.value / 100 : coupon.value),
  minimum: String(coupon.minSubtotalPaise / 100),
  maximum: coupon.maxDiscountPaise === null ? "" : String(coupon.maxDiscountPaise / 100),
  usageLimit: coupon.usageLimit === null ? "" : String(coupon.usageLimit),
  startsAt: localDate(coupon.startsAt),
  endsAt: localDate(coupon.endsAt),
  active: coupon.active,
});
const couponState = (coupon: AdminCoupon) => {
  if (!coupon.active) return "Disabled";
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() <= Date.now()) return "Expired";
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return "Used up";
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > Date.now()) return "Scheduled";
  return "Active";
};

export function AdminCoupons({ admin }: { admin: AdminUser }) {
  const result = useRecords<{ coupons: AdminCoupon[] }>("/admin/coupons");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<CouponForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState("");
  const editable = canManage(admin);
  const rows = (result.data?.coupons ?? []).filter((coupon) =>
    coupon.code.toLowerCase().includes(search.toLowerCase()),
  );
  function update<K extends keyof CouponForm>(key: K, value: CouponForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) {
      setError("The end date must come after the start date.");
      return;
    }
    setBusy(true);
    setError("");
    const payload = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: form.type === "fixed" ? Math.round(Number(form.value) * 100) : Number(form.value),
      minSubtotalPaise: Math.round(Number(form.minimum) * 100),
      maxDiscountPaise: form.maximum === "" ? null : Math.round(Number(form.maximum) * 100),
      usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      active: form.active,
    };
    try {
      await api(`/admin/coupons${form.id ? `/${form.id}` : ""}`, {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      toast.success(form.id ? "Discount updated." : "Discount created.");
      setForm(null);
      result.refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function disable(coupon: AdminCoupon) {
    setChanging(coupon.id);
    try {
      await api(`/admin/coupons/${coupon.id}`, { method: "DELETE" });
      toast.success(`${coupon.code} is disabled.`);
      result.refresh();
    } catch (reason) {
      toast.error(errorMessage(reason));
    } finally {
      setChanging("");
    }
  }
  return (
    <>
      <Heading
        title="A little reason to return."
        description="Create and manage discount codes for your customers."
      >
        {editable && (
          <button
            type="button"
            className="admin-button admin-button-primary"
            onClick={() => {
              setForm(newCoupon());
              setError("");
            }}
          >
            <Plus size={15} />
            Create discount
          </button>
        )}
      </Heading>
      <section className="admin-card">
        <div className="admin-toolbar">
          <input
            className="admin-input"
            type="search"
            aria-label="Search discount codes"
            placeholder="Search discount codes"
            value={search}
            maxLength={40}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            className="admin-button"
            type="button"
            onClick={result.refresh}
            disabled={result.loading}
            aria-label="Refresh discounts"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <DataState
          {...result}
          empty={
            rows.length
              ? false
              : search
                ? "No discount codes match your search."
                : "Create a code to offer a percentage or fixed amount off."
          }
        >
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Discount code</th>
                  <th>Value</th>
                  <th>Requirements</th>
                  <th>Usage</th>
                  <th>Availability</th>
                  {editable && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((coupon) => {
                  const state = couponState(coupon);
                  return (
                    <tr key={coupon.id}>
                      <td>
                        <strong style={{ letterSpacing: ".04em" }}>{coupon.code}</strong>
                        <small>
                          {coupon.startsAt
                            ? `From ${displayDate(coupon.startsAt)}`
                            : "Starts immediately"}
                        </small>
                      </td>
                      <td>
                        {coupon.type === "percent"
                          ? `${coupon.value}% off`
                          : `${money(coupon.value)} off`}
                        {coupon.maxDiscountPaise !== null && (
                          <small>Up to {money(coupon.maxDiscountPaise)}</small>
                        )}
                      </td>
                      <td>
                        {coupon.minSubtotalPaise > 0
                          ? `${money(coupon.minSubtotalPaise)} minimum`
                          : "No minimum"}
                        <small>
                          {coupon.endsAt ? `Ends ${displayDate(coupon.endsAt)}` : "No expiry"}
                        </small>
                      </td>
                      <td>
                        {coupon.usedCount}
                        {coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : " uses"}
                      </td>
                      <td>
                        <span
                          className={`admin-pill ${state === "Active" ? "admin-pill-good" : state === "Scheduled" ? "admin-pill-warn" : ""}`}
                        >
                          {state}
                        </span>
                      </td>
                      {editable && (
                        <td>
                          <div className="admin-row-actions">
                            <button
                              type="button"
                              className="admin-small-button"
                              onClick={() => {
                                setForm(couponForm(coupon));
                                setError("");
                              }}
                            >
                              Edit
                            </button>
                            {coupon.active && (
                              <button
                                type="button"
                                className="admin-small-button"
                                disabled={changing === coupon.id}
                                onClick={() => disable(coupon)}
                              >
                                {changing === coupon.id ? "Disabling…" : "Disable"}
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
        </DataState>
      </section>
      <ManagementModal
        open={!!form}
        title={form?.id ? "Edit discount" : "Create a discount"}
        description="Amounts are in Bangladeshi taka (BDT). Dates use your current time zone."
        busy={busy}
        onClose={() => setForm(null)}
      >
        {form && (
          <form onSubmit={save}>
            {error && (
              <p className="admin-alert" role="alert">
                {error}
              </p>
            )}
            <div className="admin-form-grid">
              <label className="admin-field">
                Discount code
                <input
                  required
                  minLength={2}
                  maxLength={40}
                  pattern="[a-zA-Z0-9_-]+"
                  title="Use letters, numbers, hyphens or underscores"
                  value={form.code}
                  onChange={(event) => update("code", event.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                />
                <small>Customers enter this code at checkout.</small>
              </label>
              <label className="admin-field">
                Discount type
                <select
                  value={form.type}
                  onChange={(event) => {
                    update("type", event.target.value as CouponForm["type"]);
                    update("value", "10");
                  }}
                >
                  <option value="percent">Percentage off</option>
                  <option value="fixed">Fixed amount off</option>
                </select>
              </label>
              <label className="admin-field">
                {form.type === "percent" ? "Percentage (%)" : "Amount off (BDT)"}
                <input
                  type="number"
                  required
                  min={form.type === "percent" ? 1 : 0.01}
                  max={form.type === "percent" ? 100 : 10000000}
                  step={form.type === "percent" ? 1 : 0.01}
                  value={form.value}
                  onChange={(event) => update("value", event.target.value)}
                />
              </label>
              <label className="admin-field">
                Minimum order subtotal (BDT)
                <input
                  type="number"
                  required
                  min="0"
                  max="10000000"
                  step="0.01"
                  value={form.minimum}
                  onChange={(event) => update("minimum", event.target.value)}
                />
              </label>
              <label className="admin-field">
                Maximum discount (BDT)
                <input
                  type="number"
                  min="0"
                  max="10000000"
                  step="0.01"
                  value={form.maximum}
                  onChange={(event) => update("maximum", event.target.value)}
                  placeholder="No cap"
                />
                <small>Leave blank for no maximum.</small>
              </label>
              <label className="admin-field">
                Total usage limit
                <input
                  type="number"
                  min="1"
                  max="10000000"
                  step="1"
                  value={form.usageLimit}
                  onChange={(event) => update("usageLimit", event.target.value)}
                  placeholder="Unlimited"
                />
                <small>Leave blank for unlimited uses.</small>
              </label>
              <label className="admin-field">
                Starts at
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => update("startsAt", event.target.value)}
                />
              </label>
              <label className="admin-field">
                Ends at
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  min={form.startsAt || undefined}
                  onChange={(event) => update("endsAt", event.target.value)}
                />
              </label>
              <label className="admin-checkbox admin-span-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => update("active", event.target.checked)}
                />
                Enable this discount
              </label>
            </div>
            <div className="admin-form-footer">
              <button
                className="admin-button"
                type="button"
                onClick={() => setForm(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="admin-button admin-button-primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save discount"}
              </button>
            </div>
          </form>
        )}
      </ManagementModal>
    </>
  );
}

interface StaffForm {
  id?: string;
  name: string;
  email: string;
  password: string;
  role: AdminRole;
  active: boolean;
}
const roleDescriptions: Record<AdminRole, string> = {
  owner: "Full store access, payment settings and team management.",
  admin: "Store operations, payment settings, payment review and activity log.",
  manager: "Products, inventory, orders, discounts and general store settings.",
  support: "View store records and help customers. Cannot change store data.",
};

export function AdminStaff({ admin }: { admin: AdminUser }) {
  const result = useRecords<{ staff: StaffMember[] }>("/admin/staff");
  const [form, setForm] = useState<StaffForm | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = result.data?.staff ?? [];
  const original = rows.find((staff) => staff.id === form?.id);
  const editingSelf = form?.id === admin.id;
  function update<K extends keyof StaffForm>(key: K, value: StaffForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError("");
    const payload: Partial<StaffForm> = form.id
      ? {
          ...(form.name !== original?.name ? { name: form.name.trim() } : {}),
          ...(form.email !== original?.email ? { email: form.email.trim() } : {}),
          ...(form.password ? { password: form.password } : {}),
          ...(form.role !== original?.role ? { role: form.role } : {}),
          ...(form.active !== original?.active ? { active: form.active } : {}),
        }
      : {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        };
    if (form.id && !Object.keys(payload).length) {
      setForm(null);
      setBusy(false);
      return;
    }
    try {
      await api(`/admin/staff${form.id ? `/${form.id}` : ""}`, {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      toast.success(form.id ? "Team member updated." : "Team member added.");
      setForm(null);
      result.refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  if (admin.role !== "owner")
    return (
      <div className="admin-alert" role="alert">
        Only the store owner can manage team access.
      </div>
    );
  return (
    <>
      <Heading
        title="Good things take a team."
        description="Give each person the access they need to look after the store."
      >
        <button
          className="admin-button admin-button-primary"
          type="button"
          onClick={() => {
            setForm({ name: "", email: "", password: "", role: "support", active: true });
            setError("");
          }}
        >
          <Plus size={15} />
          Add team member
        </button>
      </Heading>
      <div className="admin-stack">
        <section className="admin-card">
          <div className="admin-card-title">
            <h2>Store team</h2>
            <button
              className="admin-small-button"
              type="button"
              onClick={result.refresh}
              disabled={result.loading}
            >
              Refresh
            </button>
          </div>
          <DataState
            {...result}
            empty={rows.length ? false : "Team members will appear here once added."}
          >
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Team member</th>
                    <th>Role</th>
                    <th>Access</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((staff) => (
                    <tr key={staff.id}>
                      <td>
                        <strong>
                          {staff.name}
                          {staff.id === admin.id ? " (you)" : ""}
                        </strong>
                        <small>{staff.email}</small>
                      </td>
                      <td>
                        <span className="admin-pill">{staff.role}</span>
                      </td>
                      <td>
                        <span
                          className={`admin-pill ${staff.active ? "admin-pill-good" : "admin-pill-bad"}`}
                        >
                          {staff.active ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td>{displayDate(staff.createdAt)}</td>
                      <td>
                        <button
                          className="admin-small-button"
                          type="button"
                          onClick={() => {
                            setForm({
                              id: staff.id,
                              name: staff.name,
                              email: staff.email,
                              password: "",
                              role: staff.role,
                              active: staff.active !== false,
                            });
                            setError("");
                          }}
                        >
                          Edit access
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataState>
        </section>
        <section className="admin-card">
          <h2>What each role can do</h2>
          <dl className="admin-key-values">
            {(Object.keys(roleDescriptions) as AdminRole[]).map((role) => (
              <div style={{ display: "contents" }} key={role}>
                <dt style={{ textTransform: "capitalize" }}>{role}</dt>
                <dd>{roleDescriptions[role]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <ManagementModal
        open={!!form}
        title={form?.id ? "Edit team member" : "Add a team member"}
        description={
          form?.id
            ? "Update this person’s details and store access."
            : "Create a staff account. Share the sign-in details directly with your team member."
        }
        busy={busy}
        onClose={() => setForm(null)}
      >
        {form && (
          <form onSubmit={save}>
            {error && (
              <p className="admin-alert" role="alert">
                {error}
              </p>
            )}
            <div className="admin-form-grid">
              <label className="admin-field">
                Full name
                <input
                  required
                  minLength={2}
                  maxLength={180}
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                />
              </label>
              <label className="admin-field">
                Email address
                <input
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="off"
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                />
              </label>
              <label className="admin-field">
                Role
                <select
                  value={form.role}
                  disabled={editingSelf}
                  onChange={(event) => update("role", event.target.value as AdminRole)}
                >
                  <option value="support">Support</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Administrator</option>
                  <option value="owner">Owner</option>
                </select>
                <small>{roleDescriptions[form.role]}</small>
              </label>
              <label className="admin-field">
                {form.id ? "New password (optional)" : "Temporary password"}
                <input
                  required={!form.id}
                  type="password"
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => update("password", event.target.value)}
                  disabled={editingSelf}
                />
                <small>
                  {editingSelf
                    ? "Change your own password from My account."
                    : form.id
                      ? "Leave blank to keep the current password. At least 12 characters."
                      : "Use at least 12 characters. Ask them to change it in My account."}
                </small>
              </label>
              {form.id && (
                <label className="admin-checkbox admin-span-2">
                  <input
                    type="checkbox"
                    checked={form.active}
                    disabled={editingSelf}
                    onChange={(event) => update("active", event.target.checked)}
                  />
                  Allow this person to sign in
                </label>
              )}
              {editingSelf && (
                <p className="admin-section-note admin-span-2">
                  Your own owner access stays active. The store always needs at least one active
                  owner.
                </p>
              )}
              {form.id && !editingSelf && (
                <p className="admin-secret-note admin-span-2">
                  Changing the role or password, or removing sign-in access, ends this person’s
                  current sessions.
                </p>
              )}
            </div>
            <div className="admin-form-footer">
              <button
                type="button"
                className="admin-button"
                onClick={() => setForm(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" className="admin-button admin-button-primary" disabled={busy}>
                {busy ? "Saving…" : form.id ? "Save changes" : "Create account"}
              </button>
            </div>
          </form>
        )}
      </ManagementModal>
    </>
  );
}
