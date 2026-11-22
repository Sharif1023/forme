import type { StoreOrder } from "./types";
const KEY = "forme:orders:v1";
export interface OrderAccess {
  id: string;
  orderNumber: string;
  phone: string;
  lookupToken: string;
}
export function savedOrders(): OrderAccess[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (item): item is OrderAccess =>
            item && typeof item.id === "string" && typeof item.lookupToken === "string",
        )
      : [];
  } catch {
    return [];
  }
}
export function rememberOrder(order: StoreOrder, lookupToken: string) {
  try {
    const previous = savedOrders().filter((item) => item.id !== order.id);
    localStorage.setItem(
      KEY,
      JSON.stringify(
        [
          {
            id: order.id,
            orderNumber: order.orderNumber,
            phone: order.customer.phone,
            lookupToken,
          },
          ...previous,
        ].slice(0, 30),
      ),
    );
  } catch {
    /* Order remains retrievable with its order number and checkout phone. */
  }
}
export function accessForOrder(id: string) {
  return savedOrders().find((item) => item.id === id);
}
