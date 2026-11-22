import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { store } from "@/catalog";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${store.businessName}: Custom Solid Wood Doors`, template: `%s | ${store.businessName}` },
  description: store.tagline,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand" aria-label={`${store.businessName} home`}>
              {store.logo ? <img src={store.logo} alt={store.businessName} height={36} /> : store.businessName}
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/#doors">Doors</Link>
              <Link href="/measure">How to measure</Link>
              {store.contact.phone ? (
                <a href={`tel:${store.contact.phone.replace(/[^\d+]/g, "")}`}>{store.contact.phone}</a>
              ) : (
                <a href={`mailto:${store.contact.email}`}>Contact</a>
              )}
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
