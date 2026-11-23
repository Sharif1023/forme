import { dateTime, failure, useAdminData } from "./data";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Search, RefreshCw, CheckCircle2, Truck } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "@/lib/commerce/api";
import type { StoreOrder } from "@/lib/commerce/types";
import type { AdminUser } from "./types";
import { canManage, canFinance } from "./types";
import { PageHead, Loading, ErrorBox, Empty, Modal, Pagination, Status } from "./shared";

interface AdminPayment {
  id: string;
  provider: string;
  method: string;
  status: string;
  amountPaise: number;
  currency: string;
  reference: string | null;
  senderPhone: string | null;
  paidAt: string | null;
  createdAt: string;
}
interface AdminOrder extends StoreOrder {
  payments: AdminPayment[];
  reservationStatus: string;
  gatewayTransactionId?: string;
}
const transitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};
const statuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const PAGE_SIZE = 25;
export function AdminOrders({ admin }: { admin: AdminUser }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const { data, loading, error, reload } = useAdminData<{
    orders: StoreOrder[];
    total: number;
    page: number;
  }>(
    `/admin/orders?page=${page}&limit=${PAGE_SIZE}&search=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`,
  );
  if (selected)
    return (
      <OrderDetails
        id={selected}
        admin={admin}
        onBack={() => {
          setSelected(null);
          reload();
        }}
      />
    );
  return (
    <>
      <PageHead
        title="Every order, considered"
        description="From the first hello to the final delivery."
      >
        <button className="admin-button" onClick={reload} disabled={loading}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </PageHead>
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={15} />
          <input
            className="admin-input"
            aria-label="Search orders"
            placeholder="Order number or customer phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          className="admin-input"
          aria-label="Filter order status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {value[0]?.toUpperCase()}
              {value.slice(1)}
            </option>
          ))}
        </select>
        <span className="admin-result-count">{data?.total ?? 0} orders</span>
      </div>
      <ErrorBox error={error} retry={reload} />
      {loading ? (
        <Loading />
      ) : (
        <section className="admin-card">
          {data?.orders.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Delivery</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Total</th>
                    <th>
                      <span className="admin-visually-hidden">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <button className="admin-row-link" onClick={() => setSelected(order.id)}>
                          {order.orderNumber}
                        </button>
                        <small>{dateTime(order.createdAt)}</small>
                      </td>
                      <td>
                        {order.customer.name}
                        <small>{order.customer.phone}</small>
                      </td>
                      <td>{order.shipping.city}</td>
                      <td>
                        <Status value={order.status} />
                      </td>
                      <td>
                        <Status value={order.paymentStatus} />
                        <small>
                          {order.paymentMethod === "cod"
                            ? "Cash on delivery"
                            : order.paymentMethod.toUpperCase()}
                        </small>
                      </td>
                      <td>{money(order.totalPaise)}</td>
                      <td>
                        <button
                          className="admin-icon-button"
                          aria-label={`View ${order.orderNumber}`}
                          onClick={() => setSelected(order.id)}
                        >
                          <ArrowRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="A little quiet, for now.">
              {query || status
                ? "No orders match your search. Try a different order number, phone or status."
                : "New customer orders will appear here."}
            </Empty>
          )}
          {data && (
            <Pagination
              page={page}
              setPage={setPage}
              hasNext={page * PAGE_SIZE < data.total}
              total={data.total}
            />
          )}
        </section>
      )}
    </>
  );
}

function OrderDetails({ id, admin, onBack }: { id: string; admin: AdminUser; onBack: () => void }) {
  const { data, loading, error, reload, setData } = useAdminData<{ order: AdminOrder }>(
    `/admin/orders/${encodeURIComponent(id)}`,
  );
  const [nextStatus, setNextStatus] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [review, setReview] = useState<{
    payment: AdminPayment;
    decision: "approve" | "reject";
  } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const order = data?.order;
  async function updateStatus(event?: React.FormEvent) {
    event?.preventDefault();
    if (!order || !nextStatus) return;
    if (nextStatus === "cancelled" && !cancelConfirm) {
      setCancelConfirm(true);
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const result = await api<{ order: AdminOrder }>(
        `/admin/orders/${encodeURIComponent(id)}/status`,
        { method: "PATCH", body: JSON.stringify({ status: nextStatus, note }) },
      );
      setData(result);
      setNextStatus("");
      setNote("");
      setCancelConfirm(false);
      toast.success("Order status updated");
    } catch (reason) {
      setActionError(failure(reason));
    } finally {
      setBusy(false);
    }
  }
  async function reviewPayment(event: React.FormEvent) {
    event.preventDefault();
    if (!review) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await api<{ order: AdminOrder }>(
        `/admin/orders/${encodeURIComponent(id)}/review-payment`,
        {
          method: "POST",
          body: JSON.stringify({
            paymentId: review.payment.id,
            decision: review.decision,
            note: reviewNote,
          }),
        },
      );
      setData(result);
      setReview(null);
      setReviewNote("");
      toast.success(review.decision === "approve" ? "Payment approved" : "Payment rejected");
    } catch (reason) {
      setActionError(failure(reason));
    } finally {
      setBusy(false);
    }
  }
  const allowed = (transitions[order?.status || ""] || []).filter(
    (value) =>
      value === "cancelled" || order?.paymentMethod === "cod" || order?.paymentStatus === "paid",
  );
  return (
    <>
      <button className="admin-back-button" onClick={onBack}>
        <ArrowLeft size={14} />
        All orders
      </button>
      <ErrorBox error={error} retry={reload} />
      {loading ? (
        <Loading />
      ) : (
        order && (
          <>
            <PageHead title={order.orderNumber} description={`Placed ${dateTime(order.createdAt)}`}>
              <div className="admin-row-actions">
                <Status value={order.status} />
                <Status value={order.paymentStatus} />
                <button className="admin-button" onClick={reload} disabled={busy}>
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </div>
            </PageHead>
            <ErrorBox error={actionError} />
            <div className="admin-order-progress" aria-label="Order progress">
              {statuses
                .filter((value) => value !== "cancelled")
                .map((value, index, steps) => {
                  const completed = steps.indexOf(order.status) >= index;
                  return (
                    <div key={value} className={completed ? "is-complete" : ""}>
                      <span>{completed ? <CheckCircle2 size={17} /> : index + 1}</span>
                      <strong>{value}</strong>
                    </div>
                  );
                })}
            </div>
            {order.status === "cancelled" && (
              <p className="admin-alert">
                This order is cancelled.
                {order.paymentStatus === "refund_pending"
                  ? " Payment was collected; arrange and reconcile the refund with your payment provider."
                  : " Its inventory reservation has been released."}
              </p>
            )}
            <div className="admin-two-col">
              <div className="admin-stack">
                <section className="admin-card">
                  <h2>The pieces</h2>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Quantity</th>
                          <th>Unit price</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((item, index) => (
                          <tr key={item.id || index}>
                            <td>
                              <div className="admin-product-cell">
                                {item.imageUrl && <img src={item.imageUrl} alt="" />}
                                <div>
                                  <strong>{item.name}</strong>
                                  <small>
                                    {item.colorName || item.colorId} · {item.size}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>{item.quantity}</td>
                            <td>{money(item.unitPricePaise)}</td>
                            <td>{money(item.totalPaise)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <dl className="admin-order-totals">
                    <div>
                      <dt>Subtotal</dt>
                      <dd>{money(order.subtotalPaise)}</dd>
                    </div>
                    <div>
                      <dt>Discount{order.couponCode ? ` · ${order.couponCode}` : ""}</dt>
                      <dd>−{money(order.discountPaise)}</dd>
                    </div>
                    <div>
                      <dt>Delivery</dt>
                      <dd>{money(order.shippingPaise)}</dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd>{money(order.totalPaise)}</dd>
                    </div>
                  </dl>
                </section>
                <section className="admin-card">
                  <div className="admin-card-title">
                    <h2>Payment records</h2>
                    <span className="admin-pill">
                      {order.paymentMethod === "cod"
                        ? "Cash on delivery"
                        : order.paymentMethod.toUpperCase()}
                    </span>
                  </div>
                  {order.payments.length ? (
                    order.payments.map((payment) => (
                      <article className="admin-payment-record" key={payment.id}>
                        <div className="admin-card-title">
                          <strong>{money(payment.amountPaise)}</strong>
                          <Status value={payment.status} />
                        </div>
                        <dl className="admin-key-values">
                          <dt>Provider</dt>
                          <dd>{payment.provider.toUpperCase()}</dd>
                          <dt>Reference</dt>
                          <dd className="admin-monospace">
                            {payment.reference || "Not submitted"}
                          </dd>
                          {payment.senderPhone && (
                            <>
                              <dt>Sender</dt>
                              <dd>{payment.senderPhone}</dd>
                            </>
                          )}
                          <dt>Submitted</dt>
                          <dd>{dateTime(payment.createdAt)}</dd>
                          {payment.paidAt && (
                            <>
                              <dt>Collected</dt>
                              <dd>{dateTime(payment.paidAt)}</dd>
                            </>
                          )}
                        </dl>
                        {payment.status === "pending_review" && canFinance(admin) && (
                          <div className="admin-payment-review">
                            <p className="admin-section-note">
                              {payment.provider === "sslcommerz"
                                ? "This gateway payment requires reconciliation. Approval requires an independently verified gateway result. The server will check this before settling."
                                : "Check the transaction in your receiving account before approving. A customer reference alone does not confirm payment."}
                            </p>
                            <div className="admin-row-actions">
                              <button
                                className="admin-button admin-button-primary"
                                disabled={busy || order.status === "cancelled"}
                                onClick={() => {
                                  setActionError("");
                                  setReviewNote("");
                                  setReview({ payment, decision: "approve" });
                                }}
                              >
                                Review & approve
                              </button>
                              {payment.provider !== "sslcommerz" && (
                                <button
                                  className="admin-button admin-button-danger"
                                  disabled={busy}
                                  onClick={() => {
                                    setActionError("");
                                    setReviewNote("");
                                    setReview({ payment, decision: "reject" });
                                  }}
                                >
                                  Reject payment
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    ))
                  ) : (
                    <Empty
                      title={
                        order.paymentMethod === "cod" ? "Payment on arrival" : "Awaiting payment"
                      }
                    >
                      {order.paymentMethod === "cod"
                        ? "Cash is recorded as collected when this order is marked delivered."
                        : "Customer payment submissions and verified gateway results will appear here."}
                    </Empty>
                  )}
                </section>
                <section className="admin-card">
                  <h2>Order history</h2>
                  <ol className="admin-timeline">
                    {order.events?.map((event, index) => (
                      <li key={event.id || index}>
                        <strong className="admin-capitalize">
                          {event.status.replaceAll("_", " ")}
                        </strong>
                        <small>{dateTime(event.createdAt)}</small>
                        {event.note && <p>{event.note}</p>}
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
              <div className="admin-stack">
                <section className="admin-card">
                  <h2>Customer</h2>
                  <dl className="admin-key-values">
                    <dt>Name</dt>
                    <dd>{order.customer.name}</dd>
                    <dt>Phone</dt>
                    <dd>
                      <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a>
                    </dd>
                    {order.customer.email && (
                      <>
                        <dt>Email</dt>
                        <dd>
                          <a href={`mailto:${order.customer.email}`}>{order.customer.email}</a>
                        </dd>
                      </>
                    )}
                  </dl>
                </section>
                <section className="admin-card">
                  <h2>
                    <Truck size={16} /> Delivery address
                  </h2>
                  <p className="admin-address">
                    {order.shipping.address}
                    <br />
                    {order.shipping.city}
                    {order.shipping.postalCode ? ` ${order.shipping.postalCode}` : ""}
                  </p>
                  <p className="admin-section-note">Inventory: {order.reservationStatus}</p>
                </section>
                {canManage(admin) && (
                  <section className="admin-card">
                    <h2>Keep the journey moving</h2>
                    {allowed.length ? (
                      <form className="admin-stack" onSubmit={updateStatus}>
                        <label className="admin-field">
                          Next status
                          <select
                            required
                            value={nextStatus}
                            disabled={busy}
                            onChange={(e) => setNextStatus(e.target.value)}
                          >
                            <option value="">Choose an update</option>
                            {allowed.map((value) => (
                              <option key={value} value={value}>
                                {value[0]?.toUpperCase()}
                                {value.slice(1)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-field">
                          Staff note <span className="admin-optional">optional</span>
                          <textarea
                            maxLength={2000}
                            value={note}
                            disabled={busy}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Delivery details or context for the team…"
                          />
                        </label>
                        {nextStatus === "delivered" && order.paymentMethod === "cod" && (
                          <p className="admin-secret-note">
                            Mark delivered only after confirming the customer received the order and
                            cash was collected. This records {money(order.totalPaise)} as paid.
                          </p>
                        )}
                        <button
                          className="admin-button admin-button-primary"
                          disabled={busy || !nextStatus}
                        >
                          {busy ? "Updating…" : "Update order"}
                        </button>
                      </form>
                    ) : (
                      <p className="admin-section-note">
                        {["delivered", "cancelled"].includes(order.status)
                          ? "This order has reached its final status."
                          : "Verify the payment before moving this order forward."}
                      </p>
                    )}
                    {order.paymentMethod !== "cod" &&
                      order.paymentStatus !== "paid" &&
                      !["cancelled", "delivered"].includes(order.status) && (
                        <p className="admin-secret-note">
                          Fulfillment opens after payment is verified. Owners and administrators can
                          review submitted payments.
                        </p>
                      )}
                  </section>
                )}
              </div>
            </div>
          </>
        )
      )}
      {review && (
        <Modal
          title={
            review.decision === "approve" ? "Confirm received payment" : "Reject submitted payment"
          }
          description={`${money(review.payment.amountPaise)} · ${review.payment.reference || "No reference"}`}
          onClose={() => {
            if (!busy) setReview(null);
          }}
        >
          <form onSubmit={reviewPayment}>
            <ErrorBox error={actionError} />
            <p className="admin-danger-copy">
              {review.decision === "approve"
                ? "Confirm that this exact amount and reference have arrived in your receiving account. This records payment and commits reserved inventory."
                : "The customer will need to submit a correct payment. Explain why this reference could not be verified."}
            </p>
            <label className="admin-field">
              Review note
              <textarea
                required
                minLength={3}
                maxLength={2000}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="How this payment was checked…"
              />
            </label>
            <div className="admin-form-footer">
              <button
                type="button"
                className="admin-button"
                disabled={busy}
                onClick={() => setReview(null)}
              >
                Go back
              </button>
              <button
                className={`admin-button ${review.decision === "approve" ? "admin-button-primary" : "admin-button-danger"}`}
                disabled={busy}
              >
                {busy
                  ? "Saving review…"
                  : review.decision === "approve"
                    ? "Confirm payment received"
                    : "Reject payment"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {cancelConfirm && (
        <Modal
          title="Cancel this order?"
          description="This releases its reserved inventory and records your note in the order history."
          onClose={() => {
            if (!busy) setCancelConfirm(false);
          }}
        >
          <ErrorBox error={actionError} />
          <p className="admin-danger-copy">
            {order?.paymentStatus === "paid"
              ? "This order is paid. Cancellation marks its payment as refund pending. You must arrange the refund with your payment provider."
              : "This order will stop moving through fulfillment. This action cannot be reversed."}
          </p>
          <div className="admin-form-footer">
            <button
              className="admin-button"
              disabled={busy}
              onClick={() => setCancelConfirm(false)}
            >
              Keep order
            </button>
            <button
              className="admin-button admin-button-danger"
              disabled={busy}
              onClick={() => updateStatus()}
            >
              {busy ? "Cancelling…" : "Cancel order"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
