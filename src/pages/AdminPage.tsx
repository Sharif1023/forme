import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { api, ApiError, setCsrfToken } from "@/lib/commerce/api";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminAccount } from "@/components/admin/AdminAccount";
import { AdminProducts } from "@/components/admin/AdminProducts";
import { AdminInventory } from "@/components/admin/AdminInventory";
import { AdminOrders } from "@/components/admin/AdminOrders";
import {
  AdminCustomers,
  AdminCoupons,
  AdminStaff,
  AdminAudit,
} from "@/components/admin/AdminManagement";
import { AdminSettings } from "@/components/admin/AdminSettings";
import { AdminTryOn } from "@/components/admin/AdminTryOn";
import type { AdminUser, AdminSession } from "@/components/admin/types";
import "@/styles/admin.css";

type Section =
  | "overview"
  | "products"
  | "inventory"
  | "orders"
  | "customers"
  | "coupons"
  | "settings"
  | "tryon"
  | "staff"
  | "audit"
  | "account";
const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "products", label: "Products", icon: Package },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "customers", label: "Customers", icon: Users },
  { id: "coupons", label: "Discounts", icon: Ticket },
  { id: "settings", label: "Store & payments", icon: CreditCard },
  { id: "tryon", label: "AI fitting room", icon: Sparkles },
  { id: "staff", label: "Team access", icon: ShieldCheck },
  { id: "audit", label: "Activity log", icon: ClipboardList },
  { id: "account", label: "My account", icon: Settings },
] as const;

export default function AdminPage() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("overview");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    let active = true;
    api<AdminSession>("/admin/auth/me")
      .then((session) => {
        if (active) {
          setCsrfToken(session.csrfToken);
          setAdmin(session.admin);
        }
      })
      .catch((reason) => {
        if (active && !(reason instanceof ApiError && reason.status === 401))
          setError(reason.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    const expire = () => {
      setAdmin(null);
      setCsrfToken("");
      setError("Your session expired. Please sign in again.");
    };
    window.addEventListener("admin-session-expired", expire);
    return () => {
      active = false;
      window.removeEventListener("admin-session-expired", expire);
    };
  }, []);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await api<AdminSession>("/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setCsrfToken(session.csrfToken);
      setAdmin(session.admin);
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("/admin/auth/logout", { method: "POST" });
      setAdmin(null);
      setCsrfToken("");
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }
  if (checking)
    return (
      <div className="admin-app admin-loading-page">
        <span className="admin-spinner" /> Opening your workspace…
      </div>
    );
  if (!admin)
    return (
      <div className="admin-app admin-login">
        <aside>
          <a href="/" className="admin-wordmark">
            FORME<span>.</span>
          </a>
          <div>
            <p className="admin-eyebrow">Behind every considered detail</p>
            <h1>
              A good store.
              <br />
              <em>Beautifully managed.</em>
            </h1>
            <p>
              Your collection, orders and people.
              <br />
              One thoughtful workspace.
            </p>
          </div>
          <span className="admin-login-foot">THE FORME MERCHANT WORKSPACE</span>
        </aside>
        <main>
          <form onSubmit={login} className="admin-login-form">
            <span className="admin-secure-icon">
              <ShieldCheck size={22} />
            </span>
            <p className="admin-eyebrow">Welcome back</p>
            <h2>Make yourself at home.</h2>
            <p className="admin-muted">Sign in with your staff account to manage the store.</p>
            {error && (
              <p className="admin-alert" role="alert">
                {error}
              </p>
            )}
            <label className="admin-field">
              Email address
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourstore.com"
              />
            </label>
            <label className="admin-field">
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="admin-button admin-button-primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to workspace"}
              <ArrowUpRight size={16} />
            </button>
            <p className="admin-login-note">
              Need access? Ask the store owner to create your account.
            </p>
            <a href="/" className="admin-text-link">
              Back to the store
            </a>
          </form>
        </main>
      </div>
    );
  const finance = ["owner", "admin"].includes(admin.role);
  const visible = sections
    .filter((item) => item.id !== "staff" || admin.role === "owner")
    .filter((item) => !["audit", "tryon"].includes(item.id) || finance);
  return (
    <div className="admin-app admin-workspace">
      <aside className="admin-sidebar">
        <a href="/" className="admin-wordmark">
          FORME<span>.</span>
        </a>
        <p className="admin-sidebar-caption">MERCHANT WORKSPACE</p>
        <nav aria-label="Administration">
          {visible.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              aria-current={section === id ? "page" : undefined}
              className={section === id ? "is-active" : ""}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <a href="/shop" target="_blank" rel="noreferrer" className="admin-store-link">
          View your store
          <ArrowUpRight size={15} />
        </a>
        <div className="admin-profile">
          <span>{admin.name.slice(0, 1)}</span>
          <div>
            <strong>{admin.name}</strong>
            <small>{admin.role}</small>
          </div>
          <button
            type="button"
            title="Sign out"
            aria-label="Sign out"
            onClick={logout}
            disabled={busy}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <span>
            <span className="admin-online-dot" /> Store workspace
          </span>
          <span className="admin-role">{admin.role}</span>
        </header>
        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}
        {section === "overview" && (
          <AdminDashboard
            admin={admin}
            onOrders={() => setSection("orders")}
            onInventory={() => setSection("inventory")}
          />
        )}
        {section === "products" && <AdminProducts admin={admin} />}
        {section === "inventory" && <AdminInventory admin={admin} />}
        {section === "orders" && <AdminOrders admin={admin} />}
        {section === "customers" && <AdminCustomers />}
        {section === "coupons" && <AdminCoupons admin={admin} />}
        {section === "settings" && <AdminSettings admin={admin} />}
        {section === "tryon" && finance && <AdminTryOn />}
        {section === "staff" && <AdminStaff admin={admin} />}
        {section === "audit" && <AdminAudit />}
        {section === "account" && (
          <AdminAccount
            admin={admin}
            onChanged={() => {
              setAdmin(null);
              setCsrfToken("");
              setError("Password changed. Sign in with your new password.");
            }}
          />
        )}
      </main>
    </div>
  );
}
