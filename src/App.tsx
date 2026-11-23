import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { FittingStudio } from "@/components/forme/FittingStudio";
import { StudioProvider } from "@/components/forme/store";
import { CommerceProvider } from "@/lib/commerce/store";
import ShopPage from "@/pages/ShopPage";
import CheckoutPage from "@/pages/CheckoutPage";
import OrderPage from "@/pages/OrderPage";
const AdminPage = lazy(() => import("@/pages/AdminPage"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
function Storefront() {
  return (
    <CommerceProvider>
      <StudioProvider>
        <Routes>
          <Route path="/" element={<FittingStudio />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/track" element={<OrderPage />} />
          <Route path="/orders/:id" element={<OrderPage />} />
          <Route
            path="*"
            element={
              <div className="commerce-loading">
                <h1 className="font-serif text-5xl">A wrong turn.</h1>
                <p>This page could not be found.</p>
                <Link to="/shop" className="commerce-primary">
                  Explore the collection
                </Link>
              </div>
            }
          />
        </Routes>
      </StudioProvider>
    </CommerceProvider>
  );
}
export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense
        fallback={
          <div className="commerce-loading" role="status">
            Opening your workspace…
          </div>
        }
      >
        <Routes>
          <Route path="/admin/*" element={<AdminPage />} />
          <Route path="*" element={<Storefront />} />
        </Routes>
      </Suspense>
      <Toaster position="bottom-center" />
    </BrowserRouter>
  );
}
