import Link from "next/link";
import { store } from "@/catalog";

export default function NotFound() {
  return (
    <div className="wrap prose" style={{ padding: "56px 16px" }}>
      <h1>We couldn&apos;t find that page</h1>
      <p className="muted">It may have moved, or the product may no longer be sold.</p>
      <p>
        <Link className="btn" href="/">Shop all doors</Link>
      </p>
      <p className="muted">
        Looking for something specific? Email <a href={`mailto:${store.contact.email}`}>{store.contact.email}</a>
        {store.contact.phone ? ` or call ${store.contact.phone}` : ""}.
      </p>
    </div>
  );
}
