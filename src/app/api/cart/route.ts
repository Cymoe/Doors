import { NextResponse } from "next/server";
import { cartBody } from "@/cart-schema";
import { priceCart } from "@/cart";

/** Prices the browser's cart from the catalog: lines, shipping and total. */
export async function POST(req: Request) {
  const parsed = cartBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cart." }, { status: 400 });
  return NextResponse.json(priceCart(parsed.data.items));
}
