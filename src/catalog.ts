import data from "./generated/catalog.json";
import type { DoorProduct, Product, StoreConfig } from "./schema";

/**
 * The catalog as the site sees it. src/generated/catalog.json is written by
 * `npm run catalog` (run automatically before dev, build and test) from the
 * validated YAML in catalog/, so it's already checked and has defaults filled in.
 */
const catalog = data as unknown as { store: StoreConfig; products: Product[] };

export const store: StoreConfig = catalog.store;

/** Products shown on the site. Drafts are shown too in development, so you can preview them. */
export function liveProducts(): Product[] {
  const showDrafts = process.env.NODE_ENV !== "production" || process.env.SHOW_DRAFTS === "true";
  return catalog.products.filter((p) => p.status === "active" || (showDrafts && p.status === "draft"));
}

export function getDoor(handle: string): DoorProduct | undefined {
  const p = liveProducts().find((x) => x.handle === handle);
  return p?.type === "door" ? p : undefined;
}
