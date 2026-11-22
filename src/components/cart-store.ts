"use client";

import { useSyncExternalStore } from "react";
import { cartBody, type CartItem } from "@/cart-schema";
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
    const parsed = cartBody.safeParse({ items: raw ? JSON.parse(raw) : [] });
    if (parsed.success) items = parsed.data.items;
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

export const cart = {
  add(item: Omit<CartItem, "id">) {
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
      write(items.map((x) => (x === same ? { ...x, quantity: Math.min(MAX_QUANTITY, x.quantity + item.quantity) } : x)));
    } else {
      write([...items, { ...item, id: newId() }]);
    }
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
