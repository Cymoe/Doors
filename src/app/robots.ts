import type { MetadataRoute } from "next";

const base = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** /robots.txt: allow the shop, keep the cart, checkout API and order pages out of search. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/cart", "/order/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
