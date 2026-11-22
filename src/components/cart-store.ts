"use client";

import { useSyncExternalStore } from "react";
import { MAX_CART_LINES, cartItem, type CartItem } from "@/cart-schema";
import { MAX_QUANTITY } from "@/pricing";

/**
 * The cart lives in the browser (localStorage) so it survives page loads.
 * It holds choices only; /api/cart prices it.
 */
const KEY = "dtd-cart-v1";
const EVENT = "dtd-cart-change";
const EMPTY: CartItem[] = [];

let cache: { raw: string | null; items: CartItem[] } = { raw: null, items: EMPTY };

function read(): CartItem[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache.items; // storage blocked: keep what we have in memory
  }
  if (raw === cache.raw) return cache.items;
  let items = EMPTY;
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    // Keep every valid line; one bad line (e.g. from an older version of the site) doesn't empty the cart.
    if (Array.isArray(list)) {
      items = list.flatMap((x) => {
        const r = cartItem.safeParse(x);
        return r.success ? [r.data] : [];
      }).slice(0, MAX_CART_LINES);
    }
  } catch {
    items = EMPTY;
  }
  cache = { raw, items };
  return items;
}

function write(items: CartItem[]) {
  const raw = JSON.stringify(items);
  cache = { raw, items };
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // storage blocked (private mode): the cart still works until the page is closed
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

/** What happened when adding: added in full, added but capped at the per-line limit, or refused. */
export type AddResult = { status: "added" } | { status: "capped"; quantity: number } | { status: "full" };

export const cart = {
  add(item: Omit<CartItem, "id">): AddResult {
    const items = read();
    // Same product, same choices: bump the quantity instead of adding a second line.
    const same = items.find(
      (x) =>
        x.handle === item.handle &&
        x.sku === item.sku &&
        JSON.stringify(x.door) === JSON.stringify(item.door) &&
        JSON.stringify(x.addons) === JSON.stringify(item.addons),
    );
    if (same) {
      const quantity = Math.min(MAX_QUANTITY, same.quantity + item.quantity);
      write(items.map((x) => (x === same ? { ...x, quantity } : x)));
      return quantity < same.quantity + item.quantity ? { status: "capped", quantity } : { status: "added" };
    }
    if (items.length >= MAX_CART_LINES) return { status: "full" };
    write([...items, { ...item, id: newId() }]);
    return { status: "added" };
  },
  setQuantity(id: string, quantity: number) {
    write(read().map((x) => (x.id === id ? { ...x, quantity: Math.max(1, Math.min(MAX_QUANTITY, quantity)) } : x)));
  },
  remove(id: string) {
    write(read().filter((x) => x.id !== id));
  },
  clear() {
    write([]);
  },
};

export const cartCount = (items: CartItem[]) => items.reduce((a, x) => a + x.quantity, 0);
