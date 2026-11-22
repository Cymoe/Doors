import type { MetadataRoute } from "next";
import { liveCategories, liveProducts } from "@/catalog";

const base = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** /sitemap.xml: home, category pages, product pages and the measuring guide. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    ...liveCategories().map((c) => ({ url: `${base}/c/${c.key}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...liveProducts()
      .filter((p) => p.type === "door" || p.type === "standard")
      .map((p) => ({ url: `${base}/products/${p.handle}`, changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${base}/measure`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
