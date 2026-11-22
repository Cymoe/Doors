import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { getProduct, store } from "@/catalog";
import { MAX_QUANTITY, formatInches, orderTotals, quoteDoor, type OrderTotals } from "@/pricing";

const fulfillment = z.enum(["pickup", "delivery"]);
const doorBody = z.object({
  handle: z.string(),
  selection: z.object({
    configuration: z.string(),
    grade: z.string(),
    style: z.string(),
    widthIn: z.number(),
    heightIn: z.number(),
    quantity: z.number().int(),
  }),
  fulfillment,
});
const standardBody = z.object({
  handle: z.string(),
  sku: z.string(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  fulfillment,
});

const cents = (n: number) => Math.round(n * 100);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

interface Order {
  title: string;
  summary: string;
  quantity: number;
  totals: OrderTotals;
  depositPercent: number;
  metadata: Record<string, string>;
}

/**
 * Creates a Stripe Checkout session for one product (× quantity).
 * Prices are recomputed here from the catalog; nothing price-related is
 * taken from the browser. Custom doors take a deposit; everything else is
 * paid in full. Order details go in the session and payment metadata, so
 * they show on the payment in the Stripe dashboard.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const handle = typeof json?.handle === "string" ? json.handle : "";
  const product = getProduct(handle);
  if (!product) return bad("Product not found.", 404);

  let order: Order;
  if (product.type === "door") {
    const parsed = doorBody.safeParse(json);
    if (!parsed.success) return bad("Invalid request.");
    const { selection } = parsed.data;
    const quote = quoteDoor(product, selection);
    if (!quote.ok) return bad(quote.message);
    const f = parsed.data.fulfillment;
    order = {
      title: product.title,
      summary: quote.summary,
      quantity: selection.quantity,
      totals: orderTotals(quote.unitPrice, selection.quantity, f, store),
      depositPercent: store.depositPercent,
      metadata: {
        sku: quote.sku,
        opening_size: `${formatInches(selection.widthIn)} x ${formatInches(selection.heightIn)}`,
        opening_width_in: String(selection.widthIn),
        opening_height_in: String(selection.heightIn),
        unit_price: quote.unitPrice.toFixed(2),
      },
    };
  } else if (product.type === "standard") {
    const parsed = standardBody.safeParse(json);
    if (!parsed.success) return bad("Invalid request.");
    const v = product.variants.find((x) => x.sku === parsed.data.sku);
    if (!v) return bad("That option isn't available.");
    if (!v.available) return bad("That option is sold out.");
    const options = product.optionNames.map((n) => `${n}: ${v.options[n]}`).join(", ");
    order = {
      title: product.title,
      summary: options ? `${product.title} (${options})` : product.title,
      quantity: parsed.data.quantity,
      totals: orderTotals(v.price, parsed.data.quantity, parsed.data.fulfillment, { ...store, depositPercent: 100 }),
      depositPercent: 100,
      metadata: { sku: v.sku, options: options.slice(0, 500), unit_price: v.price.toFixed(2) },
    };
  } else {
    return bad("This product can't be ordered online yet.");
  }

  const f = (json as { fulfillment: "pickup" | "delivery" }).fulfillment;
  if (f === "pickup" ? !store.pickup.enabled : !store.localDelivery.enabled) {
    return bad("That delivery option isn't available.");
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return bad("Online checkout isn't set up yet. Please call or email us to order.", 503);
  const stripe = new Stripe(key);
  const origin = process.env.SITE_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  const { totals, depositPercent } = order;
  const deposit = depositPercent < 100;

  const metadata: Record<string, string> = {
    product: order.title.slice(0, 500),
    details: order.summary.slice(0, 500),
    quantity: String(order.quantity),
    fulfillment: f,
    order_total: totals.total.toFixed(2),
    paid_now: totals.dueNow.toFixed(2),
    balance_due: totals.balance.toFixed(2),
    ...order.metadata,
  };

  const description =
    `${order.quantity} × ${order.summary}. ` +
    (f === "delivery" ? `Local delivery (${store.localDelivery.area}). ` : `Pickup: ${store.pickup.location}. `) +
    (deposit
      ? `Order total $${totals.total.toFixed(2)}; this is the ${depositPercent}% deposit, $${totals.balance.toFixed(2)} due at ${f}.`
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
              name: deposit ? `${order.title}: ${depositPercent}% deposit` : `${order.title} × ${order.quantity}`,
              description: description.slice(0, 500),
            },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata, description: description.slice(0, 1000) },
      phone_number_collection: { enabled: true },
      customer_creation: "always",
      ...(f === "delivery" ? { shipping_address_collection: { allowed_countries: ["US"] } } : {}),
      ...(process.env.STRIPE_AUTOMATIC_TAX === "true" ? { automatic_tax: { enabled: true } } : {}),
      ...(deposit
        ? {
            custom_text: {
              submit: {
                message: `Deposit for a made-to-order door. The remaining $${totals.balance.toFixed(2)} is due at ${f}.`,
              },
            },
          }
        : {}),
      success_url: `${origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/order/cancelled?product=${encodeURIComponent(handle)}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("Stripe checkout error", e);
    return bad("Couldn't start checkout. Please try again.", 502);
  }
}
