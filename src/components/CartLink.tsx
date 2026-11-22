"use client";

import Link from "next/link";
import { cartCount, useCart } from "./cart-store";

export function CartLink() {
  const count = cartCount(useCart());
  return (
    <Link href="/cart" className="cart-link" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" />
        <circle cx="9.5" cy="20" r="1.3" />
        <circle cx="17.5" cy="20" r="1.3" />
      </svg>
      {count > 0 && <span className="cart-count">{count}</span>}
    </Link>
  );
}
