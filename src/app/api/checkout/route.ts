import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { getDoor, store } from "@/catalog";
import { formatInches, orderTotals, quoteDoor } from "@/pricing";

const body = z.object({
  handle: z.string(),
  selection: z.object({
    configuration: z.string(),
    grade: z.string(),
    style: z.string(),
    widthIn: z.number(),
    heightIn: z.number(),
    quantity: z.number().int(),
  }),
  fulfillment: z.enum(["pickup", "delivery"]),
});

const cents = (n: number) => Math.round(n * 100);

/**
 * Creates a Stripe Checkout session for one configured door (× quantity).
 * The price is recomputed here from the catalog; nothing price-related is
 * taken from the browser. Order details go in the session and payment
 * metadata, so they show on the payment in the Stripe dashboard.
 */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { handle, selection, fulfillment } = parsed.data;

  const product = getDoor(handle);
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  if (fulfillment === "pickup" ? !store.pickup.enabled : !store.localDelivery.enabled) {
    return NextResponse.json({ error: "That delivery option isn't available." }, { status: 400 });
  }
  const quote = quoteDoor(product, selection);
  if (!quote.ok) return NextResponse.json({ error: quote.message }, { status: 400 });
  const totals = orderTotals(quote.unitPrice, selection.quantity, fulfillment, store);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Online checkout isn't set up yet. Please request a quote instead." },
      { status: 503 },
    );
  }
  const stripe = new Stripe(key);
  const origin = process.env.SITE_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  const deposit = store.depositPercent < 100;

  const metadata: Record<string, string> = {
    product: product.title,
    sku: quote.sku,
    details: quote.summary,
    opening_size: `${formatInches(selection.widthIn)} x ${formatInches(selection.heightIn)}`,
    opening_width_in: String(selection.widthIn),
    opening_height_in: String(selection.heightIn),
    quantity: String(selection.quantity),
    unit_price: quote.unitPrice.toFixed(2),
    fulfillment,
    order_total: totals.total.toFixed(2),
    paid_now: totals.dueNow.toFixed(2),
    balance_due: totals.balance.toFixed(2),
  };

  const description =
    `${selection.quantity} × ${quote.summary}. ` +
    (fulfillment === "delivery" ? `Local delivery (${store.localDelivery.area}). ` : `Pickup: ${store.pickup.location}. `) +
    (deposit
      ? `Order total $${totals.total.toFixed(2)}; this is the ${store.depositPercent}% deposit, $${totals.balance.toFixed(2)} due at ${fulfillment}.`
      : `Order total $${totals.total.toFixed(2)}.`);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: cents(totals.dueNow),
            product_data: {
              name: deposit ? `${product.title}: ${store.depositPercent}% deposit` : product.title,
              description: description.slice(0, 500),
            },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata, description: description.slice(0, 1000) },
      phone_number_collection: { enabled: true },
      customer_creation: "always",
      ...(fulfillment === "delivery" ? { shipping_address_collection: { allowed_countries: ["US"] } } : {}),
      ...(process.env.STRIPE_AUTOMATIC_TAX === "true" ? { automatic_tax: { enabled: true } } : {}),
      custom_text: {
        submit: {
          message: deposit
            ? `Deposit for a made-to-order door. The remaining $${totals.balance.toFixed(2)} is due at ${fulfillment}.`
            : "Your door is built to order after payment.",
        },
      },
      success_url: `${origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/order/cancelled?product=${encodeURIComponent(handle)}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("Stripe checkout error", e);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
  }
}
