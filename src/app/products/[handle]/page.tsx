import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, liveProducts, store } from "@/catalog";
import { addonsFor } from "@/cart";
import { CATEGORIES, productCategory } from "@/schema";
import { DoorBuilder } from "@/components/DoorBuilder";
import { ProductBuilder } from "@/components/ProductBuilder";

export const dynamicParams = false;

/** Product types that have a page. Flooring/tile sold by the sq ft don't yet. */
const hasPage = (type: string) => type === "door" || type === "standard";

export function generateStaticParams() {
  return liveProducts()
    .filter((p) => hasPage(p.type))
    .map((p) => ({ handle: p.handle }));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const p = getProduct((await params).handle);
  if (!p) return {};
  return {
    title: p.seo?.title ? { absolute: p.seo.title } : p.title,
    description: p.seo?.description ?? p.description.replace(/\s+/g, " ").slice(0, 300),
    openGraph: p.images[0] ? { images: [p.images[0].src] } : undefined,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const p = getProduct((await params).handle);
  if (!p || !hasPage(p.type)) notFound();
  const category = productCategory(p);
  const shippingNote = `Free shipping on orders over $${store.shipping.freeOver.toLocaleString("en-US")}.`;
  return (
    <div className="wrap">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Shop</Link> <span aria-hidden="true">/</span>{" "}
        <Link href={`/c/${category}`}>{CATEGORIES[category]}</Link>
      </nav>
      {p.type === "door" ? (
        <DoorBuilder
          product={p}
          addonsByConfiguration={Object.fromEntries(p.configurations.map((c) => [c.code, addonsFor(p, c.code)]))}
          shippingNote={shippingNote}
        />
      ) : p.type === "standard" ? (
        <ProductBuilder product={p} addons={addonsFor(p)} shippingNote={shippingNote} />
      ) : null}
    </div>
  );
}
