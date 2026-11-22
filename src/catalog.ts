import data from "./generated/catalog.json";
import { CATEGORIES, productCategory, type AddonGroup, type Category, type Product, type StoreConfig } from "./schema";

/**
 * The catalog as the site sees it. src/generated/catalog.json is written by
 * `npm run catalog` (run automatically before dev, build and test) from the
 * validated YAML in catalog/, so it's already checked and has defaults filled in.
 */
const catalog = data as unknown as { store: StoreConfig; addons: AddonGroup[]; products: Product[] };

export const store: StoreConfig = catalog.store;
export const addons: AddonGroup[] = catalog.addons;

function isLive(p: Product) {
  if (p.listed && store.hiddenCategories.includes(productCategory(p))) return false;
  const showDrafts = process.env.NODE_ENV !== "production" || process.env.SHOW_DRAFTS === "true";
  return p.status === "active" || (showDrafts && p.status === "draft");
}

/** Products shown in the catalog. Drafts are shown too in development, so you can preview them. */
export function liveProducts(): Product[] {
  return catalog.products.filter((p) => isLive(p) && p.listed);
}

/** A live product by handle. Unlisted products (add-ons) only with includeUnlisted. */
export function getProduct(handle: string, opts: { includeUnlisted?: boolean } = {}): Product | undefined {
  return catalog.products.find((p) => p.handle === handle && isLive(p) && (p.listed || opts.includeUnlisted));
}

/** Categories that have at least one live product, in display order. */
export function liveCategories(): { key: Category; name: string; count: number }[] {
  const counts = new Map<Category, number>();
  for (const p of liveProducts()) counts.set(productCategory(p), (counts.get(productCategory(p)) ?? 0) + 1);
  return (Object.keys(CATEGORIES) as Category[])
    .filter((k) => counts.has(k))
    .map((k) => ({ key: k, name: CATEGORIES[k], count: counts.get(k)! }));
}

/** What a catalog card needs: photo, title, lowest price and the biggest discount. */
export interface CardInfo {
  handle: string;
  title: string;
  note?: string;
  image?: { src: string; alt: string };
  fromPrice: number;
  /** Compare-at price for the cheapest variant, when it's on sale. */
  fromCompareAt?: number;
  /** Largest percent off across variants, rounded down. */
  maxPercentOff?: number;
}

export function cardInfo(p: Product): CardInfo {
  let prices: { price: number; compareAt?: number }[];
  if (p.type === "door") prices = p.configurations.map((c) => ({ price: c.basePrice }));
  else if (p.type === "standard") prices = p.variants.map((v) => ({ price: v.price, compareAt: v.compareAtPrice }));
  else prices = p.variants.map((v) => ({ price: v.pricePerSqFt * v.sqFtPerBox }));

  const cheapest = prices.reduce((a, b) => (b.price < a.price ? b : a));
  const offs = prices.filter((x) => x.compareAt).map((x) => Math.floor((1 - x.price / x.compareAt!) * 100));
  const maxOff = offs.length ? Math.max(...offs) : 0;
  return {
    handle: p.handle,
    title: p.title,
    note: p.cardNote,
    image: p.images[0],
    fromPrice: cheapest.price,
    fromCompareAt: cheapest.compareAt,
    maxPercentOff: maxOff >= 5 ? maxOff : undefined,
  };
}

export function productsIn(category?: Category): Product[] {
  const list = liveProducts().filter((p) => !category || productCategory(p) === category);
  // Custom-built products first, then by category order, keeping file order within a category.
  const order = Object.keys(CATEGORIES);
  return list
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        Number(b.p.type === "door") - Number(a.p.type === "door") ||
        order.indexOf(productCategory(a.p)) - order.indexOf(productCategory(b.p)) ||
        a.i - b.i,
    )
    .map((x) => x.p);
}
