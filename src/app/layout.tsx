import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { liveProducts, store } from "@/catalog";
import { CartLink } from "@/components/CartLink";
import "./globals.css";

export const metadata: Metadata = {
  // Full URLs for social previews (product photos); set SITE_URL in production.
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: { default: `${store.businessName}: Solid Wood Doors`, template: `%s | ${store.businessName}` },
  description: store.tagline,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const customDoor = liveProducts().find((p) => p.type === "door");
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand" aria-label={`${store.businessName} home`}>
              {store.logo ? <img src={store.logo} alt={store.businessName} height={36} /> : store.businessName}
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/">Shop</Link>
              {customDoor && <Link href={`/products/${customDoor.handle}`} className="hide-sm">Custom doors</Link>}
              <Link href="/measure" className="hide-sm">How to measure</Link>
              {store.contact.phone ? (
                <a href={`tel:${store.contact.phone.replace(/[^\d+]/g, "")}`}>
                  <span className="hide-sm">{store.contact.phone}</span>
                  <span className="show-sm">Call</span>
                </a>
              ) : (
                <a href={`mailto:${store.contact.email}`}>Contact</a>
              )}
              <CartLink />
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p>
              {store.businessName} · {store.tagline}
            </p>
            <p>
              <a href={`mailto:${store.contact.email}`}>{store.contact.email}</a>
              {store.contact.phone ? ` · ${store.contact.phone}` : ""}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
