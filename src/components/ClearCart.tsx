"use client";

import { useEffect } from "react";
import { cart } from "./cart-store";

/** Empties the cart once an order has gone through (rendered on the order confirmation page). */
export function ClearCart() {
  useEffect(() => cart.clear(), []);
  return null;
}
