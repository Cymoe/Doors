import type { Metadata } from "next";
import Link from "next/link";
import Stripe from "stripe";
import { store } from "@/catalog";
import { usd } from "@/pricing";
import { ClearCart } from "@/components/ClearCart";

export const metadata: Metadata = { title: "Order received", robots: { index: false } };
export const dynamic = "force-dynamic";

async function loadSession(id: string | undefined) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!id || !key || !/^cs_[A-Za-z0-9_]+$/.test(id)) return undefined;
  try {
    const stripe = new Stripe(key);
    const s = await stripe.checkout.sessions.retrieve(id);
    if (s.payment_status !== "paid") return undefined;
    // Expanding line_items only returns the first 10; list them all (a cart holds up to 50 lines).
    const items = await stripe.checkout.sessions.listLineItems(id, { limit: 100 });
    return { ...s, lineItems: items.data };
  } catch {
    return undefined;
  }
}

export default async function Success({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const session = await loadSession((await searchParams).session_id);

  return (
    <div className="wrap prose" style={{ padding: "48px 16px" }}>
      {/* Only a paid order empties the cart; visiting this page otherwise leaves it alone. */}
      {session && <ClearCart />}
      <p className="eyebrow">Thank you</p>
      <h1>Your order is in.</h1>
      {session ? (
        <>
          <p>
            We&apos;ve received your payment of {usd((session.amount_total ?? 0) / 100)}
            {session.customer_details?.email ? `, and a receipt is on its way to ${session.customer_details.email}` : ""}.
          </p>
          <div className="summary">
            <table>
              <tbody>
                {session.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td>
                      {li.quantity} × {li.description}
                    </td>
                    <td>{usd(li.amount_total / 100)}</td>
                  </tr>
                ))}
                <tr>
                  <td>Shipping</td>
                  <td>{session.total_details?.amount_shipping ? usd(session.total_details.amount_shipping / 100) : "Free"}</td>
                </tr>
                {!!session.total_details?.amount_tax && (
                  <tr>
                    <td>Tax</td>
                    <td>{usd(session.total_details.amount_tax / 100)}</td>
                  </tr>
                )}
                <tr className="total">
                  <td>Total paid</td>
                  <td>{usd((session.amount_total ?? 0) / 100)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>Thanks for your order. You&apos;ll get a receipt by email.</p>
      )}
      <h2 style={{ marginTop: 32 }}>What happens next</h2>
      <ol>
        <li>We check your order and may call to confirm details, like door measurements.</li>
        <li>We build or pull your order and crate it for shipping.</li>
        <li>The freight carrier calls to set a delivery appointment. Someone 18 or older must be there to inspect and sign.</li>
      </ol>
      {store.shipping.note && <p className="muted">{store.shipping.note}</p>}
      <p>
        Questions? Email <a href={`mailto:${store.contact.email}`}>{store.contact.email}</a>
        {store.contact.phone ? ` or call ${store.contact.phone}` : ""}.
      </p>
      <p><Link href="/">Back to the shop</Link></p>
    </div>
  );
}
