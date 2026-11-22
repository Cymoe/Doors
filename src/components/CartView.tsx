"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PricedCart } from "@/cart";
import type { StoreConfig } from "@/schema";
import { usd } from "@/pricing";
import { cart, useCart } from "./cart-store";
import { QuantityPicker } from "./steps";

/** The cart page: items with photos and choices, quantities, shipping and checkout. Prices come from /api/cart. */
export function CartView({ shipping }: { shipping: StoreConfig["shipping"] }) {
  const items = useCart();
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const itemsKey = JSON.stringify(items);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!items.length) {
      setPriced(null);
      return;
    }
    const ctrl = new AbortController();
    fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((p: PricedCart) => {
        setPriced(p);
        setLoadError(null);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError("Couldn't load prices. Please refresh the page.");
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  async function checkout() {
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Checkout failed. Please try again.");
      window.location.href = body.url;
    } catch (e) {
      setCheckoutError((e as Error).message);
      setCheckingOut(false);
    }
  }

  if (!hydrated) return <p className="muted">Loading your cart…</p>;
  if (!items.length) {
    return (
      <div className="empty-cart">
        <p>Your cart is empty.</p>
        <Link className="btn" href="/">Shop doors</Link>
      </div>
    );
  }

  const toFree = priced ? shipping.freeOver - priced.subtotal : 0;

  return (
    <div className="cart">
      <ul className="cart-lines">
        {items.map((item) => {
          const line = priced?.lines.find((l) => l.id === item.id);
          const err = priced?.errors.find((e) => e.id === item.id);
          return (
            <li key={item.id} className="cart-line">
              <Link href={line?.href ?? `/products/${item.handle}`} className="cart-photo" tabIndex={-1} aria-hidden="true">
                {line?.image && <img src={line.image.src} alt="" />}
              </Link>
              <div className="cart-info">
                <Link href={line?.href ?? `/products/${item.handle}`} className="cart-title">
                  {line?.title ?? err?.title ?? "Loading…"}
                </Link>
                {line?.details.map((d) => <span key={d} className="cart-detail">{d}</span>)}
                {line?.addons.map((a) => (
                  <span key={a.key} className="cart-detail">
                    + {a.label}{a.details ? ` (${a.details})` : ""}: {usd(a.price)}
                  </span>
                ))}
                {err && <p className="notice error">{err.message} Please remove it.</p>}
                <div className="cart-actions">
                  <QuantityPicker value={item.quantity} onChange={(n) => cart.setQuantity(item.id, n)} unit={["", ""]} />
                  <button type="button" className="link" onClick={() => cart.remove(item.id)}>Remove</button>
                </div>
              </div>
              <div className="cart-price">
                {line && (
                  <>
                    <strong>{usd(line.lineTotal)}</strong>
                    {line.quantity > 1 && <span className="muted">{usd(line.unitPrice)} each</span>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="summary cart-summary" aria-live="polite">
        {loadError && <p className="notice error">{loadError}</p>}
        {priced && (
          <table>
            <tbody>
              <tr>
                <td>Subtotal</td>
                <td>{usd(priced.subtotal)}</td>
              </tr>
              <tr>
                <td>
                  {priced.shipping.method === "parcel" ? "Parcel shipping" : priced.shipping.method === "free" ? "Shipping" : "Freight shipping"}
                </td>
                <td>{priced.shipping.fee ? usd(priced.shipping.fee) : "Free"}</td>
              </tr>
              <tr className="total">
                <td>Total</td>
                <td>{usd(priced.total)}</td>
              </tr>
            </tbody>
          </table>
        )}
        {priced && toFree > 0 && (
          <p className="notice">Add {usd(toFree)} more for free shipping.</p>
        )}
        <p className="muted small-print">
          Taxes are calculated at checkout. We ship to {shipping.area}; for Alaska or Hawaii, contact us for a quote.
        </p>
        {shipping.note && <p className="muted small-print">{shipping.note}</p>}
        <button type="button" className="btn block" onClick={checkout}
          disabled={!priced || priced.errors.length > 0 || checkingOut}>
          {checkingOut ? "Opening secure checkout…" : "Check out"}
        </button>
        {checkoutError && <p className="notice error">{checkoutError}</p>}
        <p style={{ marginTop: 12, textAlign: "center" }}><Link href="/">Keep shopping</Link></p>
      </aside>
    </div>
  );
}
