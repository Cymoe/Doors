import type { Metadata } from "next";
import { store } from "@/catalog";
import { CartView } from "@/components/CartView";

export const metadata: Metadata = { title: "Cart", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="wrap">
      <h1 className="page-title">Your cart</h1>
      <CartView shipping={store.shipping} />
    </div>
  );
}
