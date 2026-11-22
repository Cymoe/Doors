import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Checkout cancelled", robots: { index: false } };

export default async function Cancelled({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const handle = (await searchParams).product;
  const back = handle && /^[a-z0-9_-]+$/.test(handle) ? `/products/${handle}` : "/";
  return (
    <div className="wrap prose" style={{ padding: "48px 16px" }}>
      <h1>Checkout cancelled</h1>
      <p>No payment was taken.</p>
      <p><Link className="btn" href={back}>Back to the product</Link></p>
    </div>
  );
}
