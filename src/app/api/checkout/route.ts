import { NextResponse } from "next/server";
import Stripe from "stripe";
import { cartBody } from "@/cart-schema";
import { priceCart } from "@/cart";
import { store } from "@/catalog";

const cents = (n: number) => Math.round(n * 100);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Creates a Stripe Checkout session for the cart. Every price is worked out
 * here from the catalog (priceCart); the browser only sends choices. Each
 * cart line becomes a Stripe line item whose description carries the
 * options, door size and add-ons, so the order reads complete in Stripe.
 */
export async function POST(req: Request) {
  const parsed = cartBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.items.length === 0) return bad("Your cart is empty.");
  const priced = priceCart(parsed.data.items);
  if (priced.errors.length) {
    return bad(`Please fix your cart first: ${priced.errors.map((e) => `${e.title}: ${e.message}`).join(" ")}`);
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return bad("Online checkout isn't set up yet. Please call or email us to order.", 503);
  const stripe = new Stripe(key);
  const origin = process.env.SITE_URL?.replace(/\/$/, "") || new URL(req.url).origin;

  // With Stripe Tax on, prices are before tax (tax is added on top); Stripe needs this said explicitly.
  const autoTax = process.env.STRIPE_AUTOMATIC_TAX === "true";
  const taxBehavior = autoTax ? { tax_behavior: "exclusive" as const } : {};

  const summary = priced.lines
    .map((l) => `${l.quantity}x ${l.sku}${l.addons.length ? ` +${l.addons.map((a) => a.key).join("+")}` : ""}`)
    .join(", ");

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: priced.lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency: "usd",
          unit_amount: cents(l.unitPrice),
          ...taxBehavior,
          product_data: {
            name: l.title.slice(0, 250),
            description: [...l.details, ...l.addons.map((a) => `+ ${a.label}${a.details ? ` (${a.details})` : ""}`), `SKU ${l.sku}`]
              .join(" · ")
              .slice(0, 500),
          },
        },
      })),
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: cents(priced.shipping.fee), currency: "usd" },
            ...taxBehavior,
            display_name:
              priced.shipping.method === "free"
                ? "Free shipping"
                : priced.shipping.method === "parcel"
                  ? "Parcel shipping"
                  : "Freight delivery (curbside)",
          },
        },
      ],
      phone_number_collection: { enabled: true },
      customer_creation: "always",
      ...(autoTax ? { automatic_tax: { enabled: true } } : {}),
      custom_text: {
        shipping_address: { message: `We ship to ${store.shipping.area}. For Alaska or Hawaii, contact us for a quote.` },
      },
      metadata: { order: summary.slice(0, 500), shipping: priced.shipping.method },
      payment_intent_data: { metadata: { order: summary.slice(0, 500) } },
      success_url: `${origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("Stripe checkout error", e);
    return bad("Couldn't start checkout. Please try again.", 502);
  }
}
