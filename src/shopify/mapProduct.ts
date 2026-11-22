import type { Product, StoreConfig } from "../schema.js";
import { buildVariants } from "../variants.js";

/**
 * Pure mapping from a catalog product to Shopify's `ProductSetInput`
 * (Admin GraphQL `productSet` mutation). No network calls here, so the
 * output can be checked in tests and with `npm run sync` (dry run).
 */

export interface MetafieldInput {
  namespace: string;
  key: string;
  type: string;
  value: string;
}

/** What we know about the product already in Shopify, if it exists. */
export interface ExistingProduct {
  id: string;
  /** SKU → variant GID, so re-syncs update variants instead of replacing them. */
  variantIdsBySku: Map<string, string>;
  /** The image list from the last sync, so unchanged images aren't re-uploaded. */
  syncedImageSources?: string[];
}

const PRODUCT_TYPE: Record<Product["type"], string> = {
  door: "Doors",
  flooring: "Flooring",
  tile: "Tile",
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function descriptionHtml(p: Product): string {
  const paras = p.description
    .split(/\n\s*\n/)
    .map((s) => s.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((s) => `<p>${escapeHtml(s)}</p>`);
  if (p.highlights.length) {
    paras.push(`<ul>${p.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`);
  }
  return paras.join("\n");
}

function metafield(namespace: string, key: string, value: string | number | boolean): MetafieldInput {
  if (typeof value === "boolean") return { namespace, key, type: "boolean", value: String(value) };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { namespace, key, type: "number_integer", value: String(value) }
      : { namespace, key, type: "number_decimal", value: String(value) };
  }
  return { namespace, key, type: "single_line_text_field", value };
}

export function productMetafields(p: Product, ns: string): MetafieldInput[] {
  const out = Object.entries(p.specs).map(([k, v]) => metafield(ns, k, v));
  out.push({ namespace: ns, key: "catalog_type", type: "single_line_text_field", value: p.type });
  if (p.type === "door") {
    out.push(metafield(ns, "custom_size", p.madeToOrder.customSize));
    if (p.madeToOrder.leadTimeWeeks) out.push(metafield(ns, "lead_time_weeks", p.madeToOrder.leadTimeWeeks));
  } else {
    out.push(metafield(ns, "waste_percent", p.wastePercent));
  }
  out.push({
    namespace: ns,
    key: "image_sources",
    type: "json",
    value: JSON.stringify(p.images.map((i) => i.src)),
  });
  return out;
}

const money = (n: number) => n.toFixed(2);

export function toProductSetInput(p: Product, store: StoreConfig, existing?: ExistingProduct) {
  const ns = store.metafieldNamespace;
  const built = buildVariants(p);
  const madeToOrder = p.type === "door";

  const variants = built.variants.map((v) => {
    const id = existing?.variantIdsBySku.get(v.sku);
    return {
      ...(id ? { id } : {}),
      optionValues: v.options.map(([optionName, name]) => ({ optionName, name })),
      price: money(v.price),
      ...(v.compareAtPrice !== undefined ? { compareAtPrice: money(v.compareAtPrice) } : {}),
      // Doors are built to order, so they can always be purchased.
      inventoryPolicy: madeToOrder ? "CONTINUE" : "DENY",
      inventoryItem: { sku: v.sku, tracked: !madeToOrder },
      metafields: Object.entries(v.meta).map(([k, val]) => ({
        namespace: ns,
        key: k,
        type: "number_decimal",
        value: String(val),
      })),
    };
  });

  const imageSources = p.images.map((i) => i.src);
  const imagesUnchanged =
    existing?.syncedImageSources !== undefined &&
    JSON.stringify(existing.syncedImageSources) === JSON.stringify(imageSources);

  return {
    ...(existing ? { id: existing.id } : {}),
    handle: p.handle,
    title: p.title,
    descriptionHtml: descriptionHtml(p),
    vendor: p.vendor ?? store.vendor,
    productType: PRODUCT_TYPE[p.type],
    status: p.status.toUpperCase(),
    tags: [...new Set([...p.tags, PRODUCT_TYPE[p.type]])],
    ...(p.seo ? { seo: p.seo } : {}),
    productOptions: built.optionNames.map((name) => ({
      name,
      values: [...new Set(built.variants.map((v) => v.options.find(([n]) => n === name)![1]))].map(
        (value) => ({ name: value }),
      ),
    })),
    variants,
    metafields: productMetafields(p, ns),
    // Leaving `files` out keeps the product's current media untouched.
    ...(imagesUnchanged
      ? {}
      : { files: p.images.map((i) => ({ originalSource: i.src, alt: i.alt, contentType: "IMAGE" })) }),
  };
}

export type ProductSetInput = ReturnType<typeof toProductSetInput>;
