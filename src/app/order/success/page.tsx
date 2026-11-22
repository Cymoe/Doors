import type { Metadata } from "next";
import Link from "next/link";
import Stripe from "stripe";
import { store } from "@/catalog";
import { usd } from "@/pricing";

export const metadata: Metadata = { title: "Order received", robots: { index: false } };
export const dynamic = "force-dynamic";

async function loadSession(id: string | undefined) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!id || !key || !/^cs_[A-Za-z0-9_]+$/.test(id)) return undefined;
  try {
    const s = await new Stripe(key).checkout.sessions.retrieve(id);
    return s.payment_status === "paid" ? s : undefined;
  } catch {
    return undefined;
  }
}

export default async function Success({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const session = await loadSession((await searchParams).session_id);
  const m = session?.metadata ?? {};

  return (
    <div className="wrap prose" style={{ padding: "48px 16px" }}>
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
                <tr><td>Door</td><td>{m.details}</td></tr>
                <tr><td>Quantity</td><td>{m.quantity}</td></tr>
                <tr><td>{m.fulfillment === "delivery" ? "Delivery" : "Pickup"}</td>
                  <td>{m.fulfillment === "delivery" ? store.localDelivery.area : store.pickup.location}</td></tr>
                <tr className="total"><td>Order total</td><td>{usd(Number(m.order_total))}</td></tr>
                <tr><td>Paid today</td><td>{usd(Number(m.paid_now))}</td></tr>
                {Number(m.balance_due) > 0 && (
                  <tr className="due"><td>Due at {m.fulfillment}</td><td>{usd(Number(m.balance_due))}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>Thanks for your order. You&apos;ll get a receipt by email.</p>
      )}
      <h2 style={{ marginTop: 32 }}>What happens next</h2>
      <ol>
        <li>We double-check your measurements and may call to confirm details.</li>
        <li>We build your door.</li>
        <li>We let you know when it&apos;s ready for {m.fulfillment === "delivery" ? "delivery" : "pickup"}.</li>
      </ol>
      <p>
        Questions? Email <a href={`mailto:${store.contact.email}`}>{store.contact.email}</a>
        {store.contact.phone ? ` or call ${store.contact.phone}` : ""}.
      </p>
      <p><Link href="/">Back to home</Link></p>
    </div>
  );
}
