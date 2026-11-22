import type { Product } from "@/lib/forme/catalog";

export interface CommerceProduct extends Product {
  pricePaise: number;
  active: boolean;
  previewSupported?: boolean;
  imageUrl?: string | null;
  sizes: string[];
}
export interface Variant {
  id: string;
  productId: string;
  colorId: string;
  size: string;
  pricePaise: number;
  stock: number;
  sku: string;
  active?: boolean;
}
export type PaymentMethod = "bkash" | "nagad" | "bank" | "cod";
export interface PaymentOption {
  enabled: boolean;
  mode?: "manual" | "sslcommerz" | "gateway";
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  branch?: string;
  routingNumber?: string;
  instructions?: string;
}
export interface StoreSettings {
  shop: { name: string; email?: string; phone?: string; address?: string; announcement?: string };
  shipping: { insideDhakaPaise: number; outsideDhakaPaise: number; freeAbovePaise?: number };
  payments: Record<PaymentMethod, PaymentOption>;
}
export interface OrderItem {
  id?: string;
  productId: string;
  name: string;
  productName?: string;
  colorId: string;
  colorName?: string;
  size: string;
  quantity: number;
  unitPricePaise: number;
  totalPaise: number;
  imageUrl?: string | null;
}
export interface Quote {
  items: OrderItem[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
  currency: "BDT";
  couponCode?: string;
}
export interface StoreOrder extends Quote {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: PaymentMethod;
  customer: { name: string; phone: string; email?: string };
  shipping: { address: string; city: string; postalCode?: string };
  createdAt: string;
  events?: { id?: string; status: string; note?: string; createdAt: string }[];
  paymentInstructions?: PaymentOption;
}
