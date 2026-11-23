import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { StoreShell } from "@/components/commerce/StoreShell";
import { api, money } from "@/lib/commerce/api";
import {
  accessForOrder,
  rememberOrder,
  savedOrders,
  type OrderAccess,
} from "@/lib/commerce/orders";
import { useCommerce } from "@/lib/commerce/store";
import type { StoreOrder } from "@/lib/commerce/types";
import { GarmentThumb } from "@/components/forme/GarmentThumb";
import { getColor, getProduct } from "@/lib/forme/catalog";

const statusLabel = (value: string) => value.replaceAll("_", " ");
const methodLabel: Record<string, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  bank: "Bank transfer",
  cod: "Cash on delivery",
};

export default function OrderPage() {
  const { id } = useParams();
  const location = useLocation();
  const locationAccess = location.state as { order?: StoreOrder; lookupToken?: string } | null;
  const { settings } = useCommerce();
  const [order, setOrder] = useState<StoreOrder | null>(locationAccess?.order ?? null);
  const [access, setAccess] = useState<OrderAccess | undefined>(() => {
    const saved = id ? accessForOrder(id) : undefined;
    if (saved) return saved;
    return locationAccess?.order && locationAccess.lookupToken
      ? {
          id: locationAccess.order.id,
          orderNumber: locationAccess.order.orderNumber,
          phone: locationAccess.order.customer.phone,
          lookupToken: locationAccess.lookupToken,
        }
      : undefined;
  });
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const fetchOrder = async (
    credentials: Partial<OrderAccess> & { orderNumber?: string; phone?: string },
  ) => {
    const result = await api<{ order: StoreOrder; lookupToken?: string }>("/orders/lookup", {
      method: "POST",
      body: JSON.stringify({ ...credentials, orderId: credentials.id }),
    });
    const token = result.lookupToken ?? credentials.lookupToken ?? "";
    if (token) {
      rememberOrder(result.order, token);
      setAccess({
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        phone: result.order.customer.phone,
        lookupToken: token,
      });
    }
    setOrder(result.order);
    setError("");
  };
  useEffect(() => {
    if (!id) return;
    const credentials = accessForOrder(id);
    if (!credentials) return;
    let active = true;
    setBusy(true);
    void fetchOrder(credentials)
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Order unavailable.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [id, reload]);
  const track = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await fetchOrder({ orderNumber: number.trim(), phone: phone.trim() });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't find that order.");
    } finally {
      setBusy(false);
    }
  };
  const proof = async (event: FormEvent) => {
    event.preventDefault();
    if (!order || !access) return;
    setBusy(true);
    setError("");
    try {
      await api(`/orders/${order.id}/payment-proof`, {
        method: "POST",
        body: JSON.stringify({
          lookupToken: access.lookupToken,
          reference: reference.trim(),
          senderPhone: senderPhone.trim() || undefined,
        }),
      });
      setReference("");
      toast("Payment reference submitted", {
        description: "Your payment is awaiting verification.",
      });
      await fetchOrder(access);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The payment reference could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  };
  const pay = async () => {
    if (!order || !access) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ redirectUrl: string }>(`/orders/${order.id}/pay`, {
        method: "POST",
        body: JSON.stringify({ lookupToken: access.lookupToken }),
      });
      window.location.assign(result.redirectUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payment is temporarily unavailable.");
      setBusy(false);
    }
  };
  const payment = order
    ? (order.paymentInstructions ?? settings.payments[order.paymentMethod])
    : undefined;
  const manual =
    payment?.mode === "manual" ||
    (order?.paymentMethod === "bank" &&
      payment?.mode !== "gateway" &&
      payment?.mode !== "sslcommerz");
  return (
    <StoreShell>
      <div className="commerce-container order-page">
        <Link to="/shop" className="commerce-back">
          <ArrowLeft size={14} /> Continue shopping
        </Link>
        <p className="commerce-eyebrow">From our wardrobe to yours</p>
        <h1 className="commerce-title">
          {order ? "Your order, in view." : "Good things are on their way."}
        </h1>
        <p className="commerce-subtitle">
          {order ? `Order ${order.orderNumber}` : "Track your order or pick up where you left off."}
        </p>
        {!order && (
          <form className="commerce-card tracking-form" onSubmit={track}>
            <Search size={25} />
            <h2>Find your order</h2>
            <label className="commerce-field">
              Order number
              <input
                required
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                placeholder="FORME-…"
              />
            </label>
            <label className="commerce-field">
              Phone number
              <input
                required
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Phone used at checkout"
              />
            </label>
            <button type="submit" className="commerce-primary" disabled={busy}>
              {busy ? "Finding your order…" : "Track order"}
              <ArrowUpRight size={15} />
            </button>
            {savedOrders().length > 0 && (
              <div className="tracking-history">
                <p>Orders on this device</p>
                {savedOrders().map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setBusy(true);
                      void fetchOrder(item)
                        .catch((reason: unknown) =>
                          setError(reason instanceof Error ? reason.message : "Order unavailable."),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    {item.orderNumber} <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            )}
          </form>
        )}
        {error && (
          <p className="commerce-error" role="alert">
            {error}
          </p>
        )}
        {order && (
          <div className="order-grid">
            <div>
              <section className="commerce-card">
                <div className="order-status">
                  <span
                    className={`order-status-icon ${order.paymentStatus === "paid" ? "is-paid" : ""}`}
                  >
                    {order.paymentStatus === "paid" || order.paymentMethod === "cod" ? (
                      <CheckCircle2 size={27} />
                    ) : (
                      <Clock size={27} />
                    )}
                  </span>
                  <div>
                    <p className="commerce-eyebrow">
                      {order.paymentMethod === "cod"
                        ? "Order received"
                        : order.paymentStatus === "paid"
                          ? "Payment confirmed"
                          : order.paymentStatus === "pending_review"
                            ? "Payment under review"
                            : "Awaiting payment"}
                    </p>
                    <h2>
                      {order.status === "cancelled"
                        ? "Order cancelled"
                        : order.paymentMethod === "cod" || order.paymentStatus === "paid"
                          ? "We've got your order."
                          : "One more step to make it yours."}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="commerce-icon"
                    aria-label="Refresh order"
                    disabled={busy}
                    onClick={() => {
                      if (access) {
                        setBusy(true);
                        void fetchOrder(access)
                          .catch((reason: unknown) =>
                            setError(
                              reason instanceof Error
                                ? reason.message
                                : "Could not refresh the order.",
                            ),
                          )
                          .finally(() => setBusy(false));
                      } else setReload((value) => value + 1);
                    }}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
                <div className="order-badges">
                  <span>{statusLabel(order.status)}</span>
                  <span>{statusLabel(order.paymentStatus)}</span>
                  <span>{methodLabel[order.paymentMethod]}</span>
                </div>
                <div className="order-delivery">
                  <Truck size={18} />
                  <div>
                    <strong>{order.customer.name}</strong>
                    <p>{order.shipping.address}</p>
                    <p>
                      {order.shipping.city}
                      {order.shipping.postalCode ? `, ${order.shipping.postalCode}` : ""}
                    </p>
                    <small>{order.customer.phone}</small>
                  </div>
                </div>
                <ol className="order-timeline">
                  {(order.events?.length
                    ? order.events
                    : [{ status: order.status, createdAt: order.createdAt }]
                  ).map((event, index) => (
                    <li key={event.id ?? index}>
                      <span>
                        <Check size={11} />
                      </span>
                      <div>
                        <strong>{statusLabel(event.status)}</strong>
                        {event.note && <p>{event.note}</p>}
                        <small>{new Date(event.createdAt).toLocaleString("en-BD")}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
              {order.paymentMethod !== "cod" &&
                order.paymentStatus !== "paid" &&
                order.status !== "cancelled" && (
                  <section className="commerce-card order-payment">
                    <div className="commerce-section-heading">
                      <CreditCard size={19} />
                      <h2>{manual ? "Payment instructions" : "Complete your payment"}</h2>
                    </div>
                    {order.paymentStatus === "pending_review" ? (
                      <div className="commerce-hint">
                        <ShieldCheck size={18} />
                        <p>
                          Your reference has been received. We'll confirm your payment after
                          checking it against our account.
                        </p>
                      </div>
                    ) : manual ? (
                      <>
                        <p>
                          Transfer exactly <strong>{money(order.totalPaise)}</strong> using{" "}
                          {methodLabel[order.paymentMethod]}. Use{" "}
                          <strong>{order.orderNumber}</strong> as your payment note.
                        </p>
                        <dl className="transfer-details">
                          {[
                            ["Account name", payment?.accountName],
                            ["Account number", payment?.accountNumber],
                            ["Bank", payment?.bankName],
                            ["Branch", payment?.branch],
                            ["Routing number", payment?.routingNumber],
                          ]
                            .filter(([, value]) => value)
                            .map(([label, value]) => (
                              <div key={label}>
                                <dt>{label}</dt>
                                <dd>
                                  {value}
                                  {label === "Account number" && (
                                    <button
                                      type="button"
                                      aria-label="Copy payment account number"
                                      onClick={() =>
                                        void navigator.clipboard
                                          .writeText(value!)
                                          .then(() => toast("Account number copied"))
                                      }
                                    >
                                      <Copy size={13} />
                                    </button>
                                  )}
                                </dd>
                              </div>
                            ))}
                        </dl>
                        {payment?.instructions && (
                          <p className="commerce-hint">{payment.instructions}</p>
                        )}
                        {access ? (
                          <form onSubmit={proof} className="payment-proof-form">
                            <label className="commerce-field">
                              Transaction / transfer reference
                              <input
                                required
                                minLength={6}
                                maxLength={80}
                                value={reference}
                                onChange={(event) => setReference(event.target.value)}
                                placeholder="Reference from your payment receipt"
                              />
                            </label>
                            <label className="commerce-field">
                              Sender's phone{" "}
                              {order.paymentMethod === "bank" && <small>optional</small>}
                              <input
                                type="tel"
                                required={order.paymentMethod !== "bank"}
                                pattern="(?:\+?880|0)1[3-9][0-9]{8}"
                                value={senderPhone}
                                onChange={(event) => setSenderPhone(event.target.value)}
                                placeholder="01XXXXXXXXX"
                              />
                            </label>
                            <button className="commerce-primary" type="submit" disabled={busy}>
                              {busy ? "Submitting…" : "Submit payment reference"}
                            </button>
                          </form>
                        ) : (
                          <p className="commerce-hint">
                            Open the order from the device used at checkout to submit your payment
                            reference.
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p>
                          You'll continue to the secure payment page to pay{" "}
                          {money(order.totalPaise)}. Your order is marked paid only after your
                          payment has been verified.
                        </p>
                        <button
                          type="button"
                          className="commerce-primary"
                          disabled={busy || !access}
                          onClick={() => void pay()}
                        >
                          {busy ? "Opening secure payment…" : "Continue to secure payment"}
                          <ArrowUpRight size={15} />
                        </button>
                      </>
                    )}
                  </section>
                )}
            </div>
            <aside className="commerce-card order-summary">
              <div className="commerce-section-heading">
                <Package size={18} />
                <h2>The pieces you picked</h2>
              </div>
              <ul className="checkout-items">
                {order.items.map((item, index) => {
                  const product = getProduct(item.productId);
                  return (
                    <li key={item.id ?? index}>
                      <div className="checkout-thumb">
                        {product ? (
                          <GarmentThumb
                            product={product}
                            hex={getColor(product, item.colorId).hex}
                            className="h-full w-full"
                          />
                        ) : (
                          <Package size={24} />
                        )}
                      </div>
                      <div>
                        <strong>{item.name ?? item.productName}</strong>
                        <small>
                          {item.colorName ?? item.colorId} · {item.size} · Qty {item.quantity}
                        </small>
                      </div>
                      <b>{money(item.totalPaise)}</b>
                    </li>
                  );
                })}
              </ul>
              <dl className="checkout-totals">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{money(order.subtotalPaise)}</dd>
                </div>
                {order.discountPaise > 0 && (
                  <div>
                    <dt>Discount</dt>
                    <dd>−{money(order.discountPaise)}</dd>
                  </div>
                )}
                <div>
                  <dt>Delivery</dt>
                  <dd>{money(order.shippingPaise)}</dd>
                </div>
                <div className="checkout-grand-total">
                  <dt>Total</dt>
                  <dd>{money(order.totalPaise)}</dd>
                </div>
              </dl>
            </aside>
          </div>
        )}
      </div>
    </StoreShell>
  );
}
