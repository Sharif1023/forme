import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";

vi.mock("@/lib/commerce/store", () => ({
  CommerceProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/forme/store", () => ({
  StudioProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/forme/FittingStudio", () => ({
  FittingStudio: () => <h1>Fitting studio</h1>,
}));
vi.mock("@/pages/ShopPage", () => ({ default: () => <h1>Collection</h1> }));
vi.mock("@/pages/CheckoutPage", () => ({ default: () => <h1>Checkout</h1> }));
vi.mock("@/pages/OrderPage", () => ({ default: () => <h1>Order tracking</h1> }));
vi.mock("@/pages/AdminPage", () => ({ default: () => <h1>Admin workspace</h1> }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("Local application routing", () => {
  it.each([
    ["/", "Fitting studio"],
    ["/shop", "Collection"],
    ["/checkout", "Checkout"],
    ["/track", "Order tracking"],
    ["/orders/00000000-0000-4000-8000-000000000000", "Order tracking"],
    ["/admin", "Admin workspace"],
    ["/admin/settings", "Admin workspace"],
    ["/missing-page", "A wrong turn."],
  ])("opens %s through the React application", async (path, heading) => {
    window.history.replaceState(null, "", path);
    render(<App />);
    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
  });
});
