export type AdminRole = "owner" | "admin" | "manager" | "support";
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active?: boolean;
}
export interface AdminSession {
  admin: AdminUser;
  csrfToken: string;
}
export interface AdminProduct {
  id: string;
  name: string;
  gender: "men" | "women";
  category: "tshirts" | "shirts" | "pants" | "shoes";
  description: string;
  pricePaise: number;
  active: boolean;
  imageUrl: string | null;
  colors: { id: string; name: string; hex: string }[];
  sizes: string[];
  studioSupported?: boolean;
  tryOn?: {
    enabled: boolean;
    ready: boolean;
    colorImages?: Record<string, string>;
  };
  style?: Record<string, unknown>;
}
export interface AdminVariant {
  id: string;
  productId: string;
  productName?: string;
  colorId: string;
  colorName: string;
  hex: string;
  size: string;
  pricePaise: number;
  stock: number;
  reserved: number;
  available: number;
  sku: string;
  active: boolean;
}
export interface AdminCustomer {
  id: string;
  name: string;
  email?: string;
  phone: string;
  orderCount: number;
  totalSpentPaise: number;
  createdAt: string;
}
export interface AdminCoupon {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  minSubtotalPaise: number;
  maxDiscountPaise: number | null;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
}
export interface StaffMember extends AdminUser {
  createdAt?: string;
}
export interface AuditEntry {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}
export const canManage = (admin: AdminUser) => ["owner", "admin", "manager"].includes(admin.role);
export const canFinance = (admin: AdminUser) => ["owner", "admin"].includes(admin.role);
