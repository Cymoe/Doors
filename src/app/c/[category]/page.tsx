import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { liveCategories, productsIn } from "@/catalog";
import { CATEGORIES, type Category } from "@/schema";
import { CatalogGrid, CategoryNav } from "@/components/CatalogGrid";

export const dynamicParams = false;

export function generateStaticParams() {
  return liveCategories().map((c) => ({ category: c.key }));
}

const isCategory = (s: string): s is Category => s in CATEGORIES;

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  return isCategory(category) ? { title: CATEGORIES[category] } : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!isCategory(category)) notFound();
  const products = productsIn(category);
  return (
    <div className="wrap">
      <CategoryNav current={category} />
      <h1 className="page-title">
        {CATEGORIES[category]} <span className="count">{products.length} products</span>
      </h1>
      <CatalogGrid products={products} />
    </div>
  );
}
