import { dateTime, useAdminData } from "./data";
import { ArrowUpRight, ArrowRight, Package, ShoppingBag, Users, Wallet } from "lucide-react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { money } from "@/lib/commerce/api";
import type { StoreOrder } from "@/lib/commerce/types";
import type { AdminUser } from "./types";
import { PageHead, Loading, ErrorBox, Empty, Status } from "./shared";

interface Dashboard {
  orders: number;
  totalRevenuePaise: number;
  pendingOrders: number;
  lowStockCount: number;
  customers: number;
  recentOrders: StoreOrder[];
  revenueByDay?: { date: string; revenuePaise: number; orders: number }[];
  orderStatusCounts?: Record<string, number>;
}
export function AdminDashboard({
  admin,
  onOrders,
  onInventory,
}: {
  admin: AdminUser;
  onOrders: () => void;
  onInventory: () => void;
}) {
  const { data, loading, error, reload } = useAdminData<Dashboard>("/admin/dashboard");
  return (
    <>
      <PageHead
        eyebrow="Your store, at a glance"
        title={`Hello, ${admin.name.split(" ")[0]}.`}
        description={new Intl.DateTimeFormat("en-BD", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date())}
      >
        <button className="admin-button" onClick={onOrders}>
          Manage orders
          <ArrowUpRight size={15} />
        </button>
      </PageHead>
      <ErrorBox error={error} retry={reload} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="admin-stats">
              {[
                {
                  label: "Collected revenue",
                  value: money(data.totalRevenuePaise),
                  note: "Paid orders, excluding cancellations",
                  icon: Wallet,
                },
                {
                  label: "Total orders",
                  value: data.orders.toLocaleString(),
                  note: `${data.pendingOrders} awaiting confirmation`,
                  icon: ShoppingBag,
                },
                {
                  label: "Customers",
                  value: data.customers.toLocaleString(),
                  note: "People who have ordered with you",
                  icon: Users,
                },
                {
                  label: "Low stock variants",
                  value: data.lowStockCount.toLocaleString(),
                  note: "5 or fewer available to sell",
                  icon: Package,
                },
              ].map((stat) => (
                <article className="admin-stat" key={stat.label}>
                  <div className="admin-stat-label">
                    <small>{stat.label}</small>
                    <stat.icon size={16} />
                  </div>
                  <strong>{stat.value}</strong>
                  <p>{stat.note}</p>
                </article>
              ))}
            </div>
            <div className="admin-two-col admin-dashboard-charts">
              <section className="admin-card">
                <div className="admin-card-title">
                  <h2>Revenue over time</h2>
                  <span className="admin-pill">Past 30 days · UTC</span>
                </div>
                <p className="admin-section-note">
                  Collected revenue from paid, non-cancelled orders, grouped by order date.
                </p>
                {data.revenueByDay?.some((day) => day.revenuePaise > 0) ? (
                  <div
                    className="admin-chart"
                    role="img"
                    aria-label="Daily collected revenue over the last 30 days"
                  >
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={data.revenueByDay}>
                        <defs>
                          <linearGradient id="adminRevenueFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#d39373" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#d39373" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#eee5d8" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => String(value).slice(5)}
                          tick={{ fontSize: 10, fill: "#a08c72" }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={32}
                        />
                        <YAxis
                          tickFormatter={(value) => `৳${Number(value) / 100}`}
                          width={65}
                          tick={{ fontSize: 10, fill: "#a08c72" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          formatter={(value) => money(Number(value))}
                          labelFormatter={(value) => String(value)}
                          contentStyle={{ borderColor: "#e8dece", borderRadius: 10, fontSize: 12 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenuePaise"
                          name="Revenue"
                          stroke="#bc7c5d"
                          strokeWidth={2}
                          fill="url(#adminRevenueFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty title="No collected revenue in this period">
                    Paid orders from the past 30 days will appear here.
                  </Empty>
                )}
              </section>
              <section className="admin-card">
                <h2>A little attention goes a long way.</h2>
                <div className="admin-attention">
                  <span className="admin-attention-icon">
                    <ShoppingBag size={20} />
                  </span>
                  <div>
                    <strong>{data.pendingOrders} pending orders</strong>
                    <p>Review new orders and keep their journey moving.</p>
                    <button className="admin-row-link" onClick={onOrders}>
                      Open orders <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
                <div className="admin-attention">
                  <span className="admin-attention-icon">
                    <Package size={20} />
                  </span>
                  <div>
                    <strong>{data.lowStockCount} low stock variants</strong>
                    <p>Top up your most wanted colours and sizes.</p>
                    <button className="admin-row-link" onClick={onInventory}>
                      Review inventory <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
                {!!data.orderStatusCounts && Object.keys(data.orderStatusCounts).length > 0 && (
                  <div className="admin-status-chart" aria-label="Order status distribution">
                    {Object.entries(data.orderStatusCounts).map(([status, count]) => (
                      <div key={status}>
                        <span>
                          <Status value={status} />
                          <strong>{count}</strong>
                        </span>
                        <div>
                          <i
                            style={{
                              width: `${data.orders ? Math.max(2, (count / data.orders) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <section className="admin-card">
              <div className="admin-card-title">
                <h2>Latest orders</h2>
                <button className="admin-button" onClick={onOrders}>
                  View all orders
                  <ArrowRight size={13} />
                </button>
              </div>
              {data.recentOrders.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Payment</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentOrders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <button className="admin-row-link" onClick={onOrders}>
                              {order.orderNumber}
                            </button>
                            <small>{dateTime(order.createdAt)}</small>
                          </td>
                          <td>
                            {order.customer.name}
                            <small>{order.customer.phone}</small>
                          </td>
                          <td>
                            <Status value={order.status} />
                          </td>
                          <td>
                            <Status value={order.paymentStatus} />
                            <small>{order.paymentMethod.toUpperCase()}</small>
                          </td>
                          <td>{money(order.totalPaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Ready for your first order">
                  New orders will appear here as your store grows.
                </Empty>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}
