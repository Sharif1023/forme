import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  LockKeyhole,
  Package,
  Truck,
} from "lucide-react";
import { useStudio } from "@/components/forme/store";
import { GarmentThumb } from "@/components/forme/GarmentThumb";
import { StoreShell } from "@/components/commerce/StoreShell";
import { api, money } from "@/lib/commerce/api";
import { useCommerce } from "@/lib/commerce/store";
import { rememberOrder } from "@/lib/commerce/orders";
import type { PaymentMethod, Quote, StoreOrder } from "@/lib/commerce/types";
import { getColor, getProduct } from "@/lib/forme/catalog";

const METHODS: { id: PaymentMethod; label: string; note: string; mark: string }[] = [
  { id: "bkash", label: "bKash", note: "Pay with your bKash account", mark: "b" },
  { id: "nagad", label: "Nagad", note: "Pay with your Nagad account", mark: "n" },
  {
    id: "bank",
    label: "Bank transfer",
    note: "Transfer directly to the store's bank account",
    mark: "▥",
  },
  { id: "cod", label: "Cash on delivery", note: "Pay when your order arrives", mark: "৳" },
];

export default function CheckoutPage() {
  const { state, dispatch } = useStudio();
  const { settings } = useCommerce();
  const navigate = useNavigate();
  const [details, setDetails] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "Dhaka",
    postalCode: "",
  });
  const available = METHODS.filter((method) => settings.payments[method.id]?.enabled);
  const [method, setMethod] = useState<PaymentMethod>(available[0]?.id ?? "cod");
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [terms, setTerms] = useState(false);
  const idempotency = useRef(crypto.randomUUID());
  const items = useMemo(
    () =>
      state.cart.map((item) => ({
        productId: item.productId,
        colorId: item.colorId,
        size: item.size,
        quantity: item.qty,
      })),
    [state.cart],
  );
  const fingerprint = JSON.stringify({ items, city: details.city, couponCode: applied });
  useEffect(() => {
    if (!items.length) return;
    let cancelled = false;
    setQuote(null);
    setQuoteError("");
    const timeout = setTimeout(() => {
      void api<Quote>("/checkout/quote", {
        method: "POST",
        body: JSON.stringify({
          items,
          shipping: { city: details.city },
          couponCode: applied || undefined,
        }),
      })
        .then((result) => {
          if (!cancelled) setQuote(result);
        })
        .catch((reason: unknown) => {
          if (!cancelled)
            setQuoteError(
              reason instanceof Error ? reason.message : "We couldn't calculate your order.",
            );
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [fingerprint, items, details.city, applied]);
  useEffect(() => {
    idempotency.current = crypto.randomUUID();
  }, [
    fingerprint,
    method,
    details.name,
    details.phone,
    details.email,
    details.address,
    details.postalCode,
  ]);
  const change = (key: keyof typeof details, value: string) =>
    setDetails((previous) => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!quote || !terms || !available.some((option) => option.id === method)) {
      setError("Please choose an available payment method and confirm your order details.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ order: StoreOrder; lookupToken: string }>("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": idempotency.current },
        body: JSON.stringify({
          customer: {
            name: details.name.trim(),
            phone: details.phone.trim(),
            email: details.email.trim() || undefined,
          },
          shipping: {
            address: details.address.trim(),
            city: details.city.trim(),
            postalCode: details.postalCode.trim() || undefined,
          },
          items,
          paymentMethod: method,
          couponCode: applied || undefined,
          idempotencyKey: idempotency.current,
        }),
      });
      rememberOrder(result.order, result.lookupToken);
      dispatch({ type: "clearCart" });
      navigate(`/orders/${result.order.id}`, { state: result });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your order could not be placed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <StoreShell>
      <div className="commerce-container checkout-page">
        <Link to="/shop" className="commerce-back">
          <ArrowLeft size={14} /> Back to the collection
        </Link>
        <div className="commerce-eyebrow">Made to be yours</div>
        <h1 className="commerce-title">The final details.</h1>
        <p className="commerce-subtitle">Your next favourites, delivered to your door.</p>
        {!state.cart.length ? (
          <div className="commerce-empty">
            <ShoppingEmpty />
            <h2>Your bag is waiting</h2>
            <p>Choose a few favourites to start your order.</p>
            <Link className="commerce-primary" to="/shop">
              Explore the collection <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="checkout-grid">
            <div className="checkout-form">
              <section className="commerce-card">
                <div className="commerce-section-heading">
                  <span>01</span>
                  <h2>Contact & delivery</h2>
                  <Truck size={18} />
                </div>
                <div className="commerce-field-grid">
                  <label className="commerce-field">
                    Full name
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                      value={details.name}
                      onChange={(event) => change("name", event.target.value)}
                      placeholder="Your full name"
                    />
                  </label>
                  <label className="commerce-field">
                    Phone number
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      required
                      pattern="(?:\+?880|0)1[3-9][0-9]{8}"
                      value={details.phone}
                      onChange={(event) => change("phone", event.target.value)}
                      placeholder="01XXXXXXXXX"
                    />
                  </label>
                  <label className="commerce-field commerce-field-wide">
                    Email address
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      maxLength={50}
                      value={details.email}
                      onChange={(event) => change("email", event.target.value)}
                      placeholder="you@example.com"
                      required={
                        settings.payments[method]?.mode === "gateway" ||
                        settings.payments[method]?.mode === "sslcommerz"
                      }
                    />
                    <small>Required for secure online payments.</small>
                  </label>
                  <label className="commerce-field commerce-field-wide">
                    Delivery address
                    <textarea
                      name="address"
                      autoComplete="street-address"
                      required
                      minLength={8}
                      maxLength={500}
                      rows={3}
                      value={details.address}
                      onChange={(event) => change("address", event.target.value)}
                      placeholder="House, road, area and any delivery instructions"
                    />
                  </label>
                  <label className="commerce-field">
                    City / district
                    <select
                      name="city"
                      value={details.city}
                      onChange={(event) => change("city", event.target.value)}
                    >
                      {[
                        "Dhaka",
                        "Chattogram",
                        "Sylhet",
                        "Rajshahi",
                        "Khulna",
                        "Barishal",
                        "Rangpur",
                        "Mymensingh",
                        "Cumilla",
                        "Gazipur",
                        "Narayanganj",
                        "Other",
                      ].map((city) => (
                        <option key={city}>{city}</option>
                      ))}
                    </select>
                  </label>
                  <label className="commerce-field">
                    Postal code <small>optional</small>
                    <input
                      name="postalCode"
                      autoComplete="postal-code"
                      maxLength={10}
                      value={details.postalCode}
                      onChange={(event) => change("postalCode", event.target.value)}
                      placeholder="1209"
                    />
                  </label>
                </div>
              </section>
              <section className="commerce-card">
                <div className="commerce-section-heading">
                  <span>02</span>
                  <h2>How would you like to pay?</h2>
                  <CreditCard size={18} />
                </div>
                <div className="payment-options" role="radiogroup" aria-label="Payment method">
                  {available.map((option) => (
                    <label
                      key={option.id}
                      className={`payment-option ${method === option.id ? "is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={option.id}
                        checked={method === option.id}
                        onChange={() => setMethod(option.id)}
                      />
                      <span className={`payment-mark payment-${option.id}`}>{option.mark}</span>
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.note}</small>
                      </span>
                      {method === option.id && <Check size={17} />}
                    </label>
                  ))}
                </div>
                {!available.length && (
                  <p className="commerce-error" role="alert">
                    Ordering is temporarily unavailable. Please contact the store.
                  </p>
                )}
                {method !== "cod" && settings.payments[method]?.mode === "manual" && (
                  <p className="commerce-hint">
                    Your order page will show transfer instructions. Send your transaction reference
                    there; your order is confirmed after the payment is verified.
                  </p>
                )}
              </section>
              <label className="checkout-consent">
                <input
                  type="checkbox"
                  required
                  checked={terms}
                  onChange={(event) => setTerms(event.target.checked)}
                />
                <span>I have checked my contact details, delivery address and selected items.</span>
              </label>
              {error && (
                <p className="commerce-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <aside className="checkout-summary commerce-card">
              <div className="commerce-section-heading">
                <span>03</span>
                <h2>Your order</h2>
                <Package size={18} />
              </div>
              <ul className="checkout-items">
                {state.cart.map((item) => {
                  const product = getProduct(item.productId);
                  if (!product) return null;
                  const color = getColor(product, item.colorId);
                  const quoted = quote?.items.find(
                    (line) =>
                      line.productId === item.productId &&
                      line.colorId === item.colorId &&
                      line.size === item.size,
                  );
                  return (
                    <li key={item.key}>
                      <div className="checkout-thumb">
                        <GarmentThumb
                          product={product}
                          hex={color.hex}
                          colorId={item.colorId}
                          className="h-full w-full"
                        />
                      </div>
                      <div>
                        <strong>{product.name}</strong>
                        <small>
                          {color.name} · {item.size} · Qty {item.qty}
                        </small>
                      </div>
                      <b>{quoted ? money(quoted.totalPaise) : "…"}</b>
                    </li>
                  );
                })}
              </ul>
              <div className="checkout-coupon">
                <label className="sr-only" htmlFor="coupon">
                  Discount code
                </label>
                <input
                  id="coupon"
                  placeholder="Have a discount code?"
                  value={coupon}
                  onChange={(event) => setCoupon(event.target.value.toUpperCase())}
                  maxLength={32}
                />
                <button type="button" onClick={() => setApplied(coupon.trim())}>
                  {applied ? "Update" : "Apply"}
                </button>
              </div>
              {applied && (
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => {
                    setCoupon("");
                    setApplied("");
                  }}
                >
                  Remove {applied}
                </button>
              )}
              {quoteError && (
                <p className="commerce-error" role="alert">
                  {quoteError}
                </p>
              )}
              {quote ? (
                <dl className="checkout-totals">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{money(quote.subtotalPaise)}</dd>
                  </div>
                  {quote.discountPaise > 0 && (
                    <div className="text-green-700">
                      <dt>Discount</dt>
                      <dd>−{money(quote.discountPaise)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Delivery</dt>
                    <dd>{quote.shippingPaise === 0 ? "On us" : money(quote.shippingPaise)}</dd>
                  </div>
                  <div className="checkout-grand-total">
                    <dt>
                      Total <small>BDT</small>
                    </dt>
                    <dd>{money(quote.totalPaise)}</dd>
                  </div>
                </dl>
              ) : (
                !quoteError && <p className="commerce-hint">Calculating your order…</p>
              )}
              <button
                className="commerce-primary w-full"
                disabled={busy || !quote || !available.length}
                type="submit"
              >
                {busy
                  ? "Placing your order…"
                  : method === "cod"
                    ? "Place order"
                    : "Place order & continue to payment"}
                <ArrowRight size={16} />
              </button>
              <p className="checkout-secure">
                <LockKeyhole size={13} /> Secure checkout · No card details stored here
              </p>
            </aside>
          </form>
        )}
      </div>
    </StoreShell>
  );
}
function ShoppingEmpty() {
  return <Package className="mx-auto size-9 text-muted-foreground" />;
}
