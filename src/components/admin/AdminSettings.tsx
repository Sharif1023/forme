import { failure, useAdminData } from "./data";
import { useEffect, useState, type FormEvent } from "react";
import { Banknote, CheckCircle2, CreditCard, Save, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/commerce/api";
import { canFinance, canManage, type AdminUser } from "./types";
import { ErrorBox, Loading, PageHead } from "./shared";

interface MobileSettings {
  enabled: boolean;
  mode: "gateway" | "manual";
  accountNumber: string;
  instructions: string;
}
interface Settings {
  shop: {
    name: string;
    contactEmail: string;
    contactPhone: string;
    address: string;
    announcement: string;
    currency: "BDT";
  };
  shipping: {
    standardFeePaise: number;
    freeShippingThresholdPaise: number;
    insideDhakaPaise: number;
    outsideDhakaPaise: number;
    freeAbovePaise: number;
  };
  payments: {
    cod: { enabled: boolean };
    bkash: MobileSettings;
    nagad: MobileSettings;
    bank: {
      enabled: boolean;
      accountName: string;
      bankName: string;
      accountNumber: string;
      branchName: string;
      routingNumber: string;
      instructions: string;
    };
    sslcommerz: {
      enabled: boolean;
      environment: "sandbox" | "live";
      storeId: string;
      storePassword: string;
      configured?: boolean;
    };
  };
}
interface ShippingForm {
  inside: string;
  outside: string;
  freeAbove: string;
}
const shippingForm = (settings: Settings): ShippingForm => ({
  inside: String(settings.shipping.insideDhakaPaise / 100),
  outside: String(settings.shipping.outsideDhakaPaise / 100),
  freeAbove: String(settings.shipping.freeAbovePaise / 100),
});

export function AdminSettings({ admin }: { admin: AdminUser }) {
  const result = useAdminData<Settings>("/admin/settings");
  const [form, setForm] = useState<Settings | null>(null);
  const [shipping, setShipping] = useState<ShippingForm>({
    inside: "",
    outside: "",
    freeAbove: "",
  });
  const [credentials, setCredentials] = useState({ storeId: "", storePassword: "" });
  const [removeCredentials, setRemoveCredentials] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const editable = canManage(admin);
  const finance = canFinance(admin);
  useEffect(() => {
    if (!result.data) return;
    setForm(structuredClone(result.data));
    setShipping(shippingForm(result.data));
    setCredentials({ storeId: "", storePassword: "" });
    setRemoveCredentials(false);
    setError("");
  }, [result.data]);
  function updateShop<K extends keyof Settings["shop"]>(key: K, value: Settings["shop"][K]) {
    setSaved(false);
    setForm((current) =>
      current ? { ...current, shop: { ...current.shop, [key]: value } } : current,
    );
  }
  function updatePayment<K extends keyof Settings["payments"]>(
    key: K,
    patch: Partial<Settings["payments"][K]>,
  ) {
    setSaved(false);
    setForm((current) =>
      current
        ? {
            ...current,
            payments: { ...current.payments, [key]: { ...current.payments[key], ...patch } },
          }
        : current,
    );
  }
  const gatewayHasCredentials =
    !removeCredentials &&
    Boolean(
      (credentials.storeId || form?.payments.sslcommerz.storeId) &&
      (credentials.storePassword || form?.payments.sslcommerz.storePassword),
    );
  const gatewayReady = Boolean(form?.payments.sslcommerz.enabled && gatewayHasCredentials);
  function validationError() {
    if (!form || !finance) return "";
    if (form.payments.sslcommerz.enabled && !gatewayHasCredentials)
      return "Add both your SSLCommerz store ID and store password before enabling the gateway.";
    for (const provider of ["bkash", "nagad"] as const) {
      const method = form.payments[provider];
      const label = provider === "bkash" ? "bKash" : "Nagad";
      if (method.enabled && method.mode === "manual" && !method.accountNumber.trim())
        return `Add the ${label} receiving account before enabling manual payments.`;
      if (method.enabled && method.mode === "gateway" && !gatewayReady)
        return `Configure and enable SSLCommerz before enabling ${label} gateway payments.`;
    }
    if (
      form.payments.bank.enabled &&
      (!form.payments.bank.bankName.trim() || !form.payments.bank.accountNumber.trim())
    )
      return "Add the bank name and account number before enabling bank transfers.";
    return "";
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || !editable) return;
    const invalid = validationError();
    if (invalid) {
      setError(invalid);
      setSaved(false);
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    const payload: Partial<Settings> = {
      shop: {
        ...form.shop,
        name: form.shop.name.trim(),
        contactEmail: form.shop.contactEmail.trim(),
      },
      shipping: {
        insideDhakaPaise: Math.round(Number(shipping.inside) * 100),
        outsideDhakaPaise: Math.round(Number(shipping.outside) * 100),
        freeAbovePaise: Math.round(Number(shipping.freeAbove) * 100),
        standardFeePaise: Math.round(Number(shipping.inside) * 100),
        freeShippingThresholdPaise: Math.round(Number(shipping.freeAbove) * 100),
      },
    };
    if (finance) {
      const gateway = { ...form.payments.sslcommerz };
      delete gateway.configured;
      gateway.storeId = removeCredentials
        ? ""
        : credentials.storeId.trim() || form.payments.sslcommerz.storeId;
      gateway.storePassword = removeCredentials
        ? ""
        : credentials.storePassword || form.payments.sslcommerz.storePassword;
      payload.payments = { ...form.payments, sslcommerz: gateway };
    }
    try {
      const updated = await api<Settings>("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      result.setData(updated);
      setSaved(true);
      toast.success("Store settings saved.");
    } catch (reason) {
      setError(failure(reason));
    } finally {
      setBusy(false);
    }
  }
  if (result.loading)
    return (
      <>
        <PageHead
          title="Make it yours."
          description="Store details, delivery rates and the ways your customers can pay."
        />
        <Loading />
      </>
    );
  if (result.error)
    return (
      <>
        <PageHead
          title="Store & payments"
          description="Your store’s details and checkout preferences."
        />
        <ErrorBox error={result.error} retry={result.reload} />
      </>
    );
  if (!form) return null;
  const payments = form.payments;
  return (
    <>
      <PageHead
        eyebrow="The thoughtful details"
        title="Make it yours."
        description="Store details, delivery rates and the ways your customers can pay."
      >
        {editable && (
          <button
            type="submit"
            form="admin-settings-form"
            className="admin-button admin-button-primary"
            disabled={busy}
          >
            <Save size={15} />
            {busy ? "Saving…" : "Save settings"}
          </button>
        )}
      </PageHead>
      {!editable && (
        <p className="admin-secret-note">
          You have view access. Ask an owner, administrator or manager to update store settings.
        </p>
      )}
      {error && <ErrorBox error={error} />}
      {saved && (
        <p className="admin-notice" role="status">
          <CheckCircle2
            size={15}
            style={{ display: "inline", verticalAlign: "middle", marginRight: 7 }}
          />
          Your settings have been saved.
        </p>
      )}
      <form id="admin-settings-form" onSubmit={save} className="admin-stack">
        <section className="admin-card">
          <div className="admin-card-title">
            <h2>Store details</h2>
            <span className="admin-pill">BDT · Bangladesh</span>
          </div>
          <fieldset disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="admin-form-grid">
              <label className="admin-field">
                Store name
                <input
                  required
                  maxLength={180}
                  value={form.shop.name}
                  onChange={(event) => updateShop("name", event.target.value)}
                />
              </label>
              <label className="admin-field">
                Customer support email
                <input
                  type="email"
                  maxLength={254}
                  value={form.shop.contactEmail}
                  onChange={(event) => updateShop("contactEmail", event.target.value)}
                  placeholder="hello@yourstore.com"
                />
              </label>
              <label className="admin-field">
                Customer support phone
                <input
                  type="tel"
                  maxLength={32}
                  value={form.shop.contactPhone}
                  onChange={(event) => updateShop("contactPhone", event.target.value)}
                  placeholder="+880…"
                />
              </label>
              <label className="admin-field">
                Store address
                <textarea
                  maxLength={2000}
                  value={form.shop.address}
                  onChange={(event) => updateShop("address", event.target.value)}
                />
              </label>
              <label className="admin-field admin-span-2">
                Store announcement
                <textarea
                  maxLength={2000}
                  value={form.shop.announcement}
                  onChange={(event) => updateShop("announcement", event.target.value)}
                  placeholder="A short update for your customers"
                />
                <small>Displayed in the storefront when an announcement is added.</small>
              </label>
            </div>
          </fieldset>
        </section>
        <section className="admin-card">
          <div className="admin-card-title">
            <h2>
              <Truck
                size={16}
                style={{ display: "inline", verticalAlign: "middle", marginRight: 8 }}
              />
              Delivery
            </h2>
            <span className="admin-pill">Amounts in BDT</span>
          </div>
          <fieldset disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="admin-form-grid">
              <label className="admin-field">
                Inside Dhaka delivery fee
                <input
                  type="number"
                  required
                  min="0"
                  max="100000"
                  step="0.01"
                  value={shipping.inside}
                  onChange={(event) => {
                    setShipping((current) => ({ ...current, inside: event.target.value }));
                    setSaved(false);
                  }}
                />
              </label>
              <label className="admin-field">
                Outside Dhaka delivery fee
                <input
                  type="number"
                  required
                  min="0"
                  max="100000"
                  step="0.01"
                  value={shipping.outside}
                  onChange={(event) => {
                    setShipping((current) => ({ ...current, outside: event.target.value }));
                    setSaved(false);
                  }}
                />
              </label>
              <label className="admin-field">
                Free delivery above
                <input
                  type="number"
                  required
                  min="0"
                  max="10000000"
                  step="0.01"
                  value={shipping.freeAbove}
                  onChange={(event) => {
                    setShipping((current) => ({ ...current, freeAbove: event.target.value }));
                    setSaved(false);
                  }}
                />
                <small>
                  Based on the order subtotal after discounts. Enter 0 to turn off free delivery.
                </small>
              </label>
            </div>
          </fieldset>
        </section>
        <section className="admin-card">
          <div className="admin-card-title">
            <h2>Payment methods</h2>
            <CreditCard size={18} color="#9e7658" />
          </div>
          <p className="admin-section-note">
            Cash on delivery works without merchant credentials. Add your wallet, bank or gateway
            details here whenever you are ready.
          </p>
          {!finance && (
            <p className="admin-secret-note">
              Only an owner or administrator can change payment settings.
            </p>
          )}
          <fieldset disabled={!finance || busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="admin-payment-grid">
              <div className="admin-payment-card">
                <header>
                  <h3>
                    <Banknote
                      size={16}
                      style={{ display: "inline", verticalAlign: "middle", marginRight: 7 }}
                    />
                    Cash on delivery
                  </h3>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={payments.cod.enabled}
                      onChange={(event) => updatePayment("cod", { enabled: event.target.checked })}
                    />
                    Enabled
                  </label>
                </header>
                <p className="admin-section-note">
                  Customers pay when their order arrives. Payment remains unpaid until an authorized
                  staff member records the collection.
                </p>
                <span className={`admin-pill ${payments.cod.enabled ? "admin-pill-good" : ""}`}>
                  {payments.cod.enabled ? "Available at checkout" : "Disabled"}
                </span>
              </div>
              {(["bkash", "nagad"] as const).map((provider) => {
                const method = payments[provider];
                const label = provider === "bkash" ? "bKash" : "Nagad";
                const ready =
                  method.mode === "manual" ? Boolean(method.accountNumber.trim()) : gatewayReady;
                return (
                  <div className="admin-payment-card" key={provider}>
                    <header>
                      <h3>{label}</h3>
                      <label className="admin-checkbox">
                        <input
                          type="checkbox"
                          checked={method.enabled}
                          onChange={(event) =>
                            updatePayment(provider, { enabled: event.target.checked })
                          }
                        />
                        Enabled
                      </label>
                    </header>
                    <label className="admin-field">
                      Payment flow
                      <select
                        value={method.mode}
                        onChange={(event) =>
                          updatePayment(provider, {
                            mode: event.target.value as MobileSettings["mode"],
                          })
                        }
                      >
                        <option value="gateway">Verified gateway checkout</option>
                        <option value="manual">Manual transfer & review</option>
                      </select>
                    </label>
                    {method.mode === "manual" ? (
                      <>
                        <label className="admin-field">
                          Receiving account number
                          <input
                            maxLength={64}
                            inputMode="tel"
                            value={method.accountNumber}
                            onChange={(event) =>
                              updatePayment(provider, { accountNumber: event.target.value })
                            }
                            placeholder="Your merchant or receiving account"
                          />
                          <small>Use the correct account for your accepted payment flow.</small>
                        </label>
                        <label className="admin-field">
                          Payment instructions
                          <textarea
                            maxLength={2000}
                            value={method.instructions}
                            onChange={(event) =>
                              updatePayment(provider, { instructions: event.target.value })
                            }
                            placeholder="Instructions customers should follow before submitting their transaction reference"
                          />
                        </label>
                        <p className="admin-section-note">
                          Customer references require staff review. A submitted reference does not
                          mark an order as paid.
                        </p>
                      </>
                    ) : (
                      <p className="admin-section-note">
                        Customers complete payment through SSLCommerz. Configure the gateway below
                        and confirm that {label} is available on your merchant account.
                      </p>
                    )}
                    <span
                      className={`admin-pill ${method.enabled && ready ? "admin-pill-good" : method.enabled ? "admin-pill-warn" : ""}`}
                    >
                      {!method.enabled
                        ? "Disabled"
                        : ready
                          ? "Ready to enable on save"
                          : "Setup needed"}
                    </span>
                  </div>
                );
              })}
              <div className="admin-payment-card">
                <header>
                  <h3>Bank transfer</h3>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={payments.bank.enabled}
                      onChange={(event) => updatePayment("bank", { enabled: event.target.checked })}
                    />
                    Enabled
                  </label>
                </header>
                <label className="admin-field">
                  Account name
                  <input
                    maxLength={180}
                    value={payments.bank.accountName}
                    onChange={(event) => updatePayment("bank", { accountName: event.target.value })}
                  />
                </label>
                <label className="admin-field">
                  Bank name
                  <input
                    maxLength={180}
                    value={payments.bank.bankName}
                    onChange={(event) => updatePayment("bank", { bankName: event.target.value })}
                  />
                </label>
                <label className="admin-field">
                  Account number
                  <input
                    maxLength={100}
                    value={payments.bank.accountNumber}
                    onChange={(event) =>
                      updatePayment("bank", { accountNumber: event.target.value })
                    }
                  />
                </label>
                <label className="admin-field">
                  Branch name
                  <input
                    maxLength={180}
                    value={payments.bank.branchName}
                    onChange={(event) => updatePayment("bank", { branchName: event.target.value })}
                  />
                </label>
                <label className="admin-field">
                  Routing number
                  <input
                    maxLength={40}
                    value={payments.bank.routingNumber}
                    onChange={(event) =>
                      updatePayment("bank", { routingNumber: event.target.value })
                    }
                  />
                </label>
                <label className="admin-field">
                  Transfer instructions
                  <textarea
                    maxLength={2000}
                    value={payments.bank.instructions}
                    onChange={(event) =>
                      updatePayment("bank", { instructions: event.target.value })
                    }
                    placeholder="Add your transfer instructions and any reference requirements"
                  />
                </label>
                <p className="admin-section-note">
                  An owner or administrator verifies the payment before the order is marked paid.
                </p>
              </div>
            </div>
          </fieldset>
        </section>
        <section className="admin-card">
          <div className="admin-card-title">
            <h2>
              <ShieldCheck
                size={17}
                style={{ display: "inline", verticalAlign: "middle", marginRight: 8 }}
              />
              SSLCommerz gateway
            </h2>
            <span
              className={`admin-pill ${payments.sslcommerz.configured && !removeCredentials ? "admin-pill-good" : ""}`}
            >
              {payments.sslcommerz.configured && !removeCredentials
                ? "Credentials saved"
                : "Not configured"}
            </span>
          </div>
          <p className="admin-section-note">
            Connect your merchant account when it is available. Use sandbox credentials for test
            payments and live credentials for actual customer payments.
          </p>
          <fieldset disabled={!finance || busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="admin-form-grid">
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={payments.sslcommerz.enabled}
                  onChange={(event) =>
                    updatePayment("sslcommerz", { enabled: event.target.checked })
                  }
                />
                Enable SSLCommerz gateway
              </label>
              <label className="admin-field">
                Environment
                <select
                  value={payments.sslcommerz.environment}
                  onChange={(event) =>
                    updatePayment("sslcommerz", {
                      environment: event.target.value as "sandbox" | "live",
                    })
                  }
                >
                  <option value="sandbox">Sandbox · test payments</option>
                  <option value="live">Live · customer payments</option>
                </select>
              </label>
              <label className="admin-field">
                Store ID
                <input
                  type="password"
                  autoComplete="off"
                  maxLength={4096}
                  disabled={removeCredentials || !finance || busy}
                  value={credentials.storeId}
                  onChange={(event) => {
                    setCredentials((current) => ({ ...current, storeId: event.target.value }));
                    setSaved(false);
                  }}
                  placeholder={
                    payments.sslcommerz.storeId
                      ? "Saved securely · leave blank to keep"
                      : "Enter your SSLCommerz store ID"
                  }
                />
                <small>
                  {payments.sslcommerz.storeId
                    ? "A store ID is saved. Enter a value only to replace it."
                    : "Provided by SSLCommerz for your merchant account."}
                </small>
              </label>
              <label className="admin-field">
                Store password
                <input
                  type="password"
                  autoComplete="new-password"
                  maxLength={4096}
                  disabled={removeCredentials || !finance || busy}
                  value={credentials.storePassword}
                  onChange={(event) => {
                    setCredentials((current) => ({
                      ...current,
                      storePassword: event.target.value,
                    }));
                    setSaved(false);
                  }}
                  placeholder={
                    payments.sslcommerz.storePassword
                      ? "Saved securely · leave blank to keep"
                      : "Enter your SSLCommerz store password"
                  }
                />
                <small>
                  {payments.sslcommerz.storePassword
                    ? "A password is saved. Enter a value only to replace it."
                    : "Use the matching password for the selected environment."}
                </small>
              </label>
              {(payments.sslcommerz.storeId || payments.sslcommerz.storePassword) && (
                <label className="admin-checkbox admin-span-2">
                  <input
                    type="checkbox"
                    checked={removeCredentials}
                    onChange={(event) => {
                      setRemoveCredentials(event.target.checked);
                      setSaved(false);
                    }}
                  />
                  Remove saved gateway credentials when saving
                </label>
              )}
              <p className="admin-secret-note admin-span-2">
                Credentials are encrypted on the server and are never returned to this page. Leaving
                these fields blank keeps the saved values. When changing environment, replace both
                fields with the matching credentials.
              </p>
              {payments.sslcommerz.environment === "sandbox" && payments.sslcommerz.enabled && (
                <p className="admin-section-note admin-span-2">
                  Sandbox mode processes test payments. Switch to Live and add live merchant
                  credentials before accepting customer gateway payments.
                </p>
              )}
              {removeCredentials && (
                <p className="admin-alert admin-span-2">
                  Disable SSLCommerz and any wallet using gateway checkout before removing these
                  credentials.
                </p>
              )}
            </div>
          </fieldset>
        </section>
        {editable && (
          <footer className="admin-form-footer" style={{ marginTop: 0 }}>
            <span className="admin-section-note" style={{ marginRight: "auto" }}>
              Changes appear at checkout after saving.
            </span>
            <button
              type="button"
              className="admin-button"
              disabled={busy}
              onClick={() => {
                if (result.data) {
                  setForm(structuredClone(result.data));
                  setShipping(shippingForm(result.data));
                  setCredentials({ storeId: "", storePassword: "" });
                  setRemoveCredentials(false);
                  setError("");
                  setSaved(false);
                }
              }}
            >
              Reset changes
            </button>
            <button type="submit" className="admin-button admin-button-primary" disabled={busy}>
              <Save size={15} />
              {busy ? "Saving…" : "Save settings"}
            </button>
          </footer>
        )}
      </form>
    </>
  );
}
