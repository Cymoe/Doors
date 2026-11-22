import { addons as addonGroups, getProduct, store } from "./catalog";
import type { CartItem } from "./cart-schema";
import { formatInches, quoteDoor, shippingFee, type ShippingMethod } from "./pricing";
import { productCategory, type AddonGroup, type Product, type StandardProduct } from "./schema";

/** An add-on as offered on one product: which group, the product it comes from, and any fixed options. */
export interface AddonOffer {
  key: string;
  label: string;
  description?: string;
  note?: string;
  product: Pick<StandardProduct, "handle" | "title" | "optionNames" | "variants">;
  /** Options already decided (e.g. "Door Configuration: Double Door"); the customer picks the rest. */
  fixed: Record<string, string>;
}

/**
 * Add-ons offered for a product. For the custom door, pass the configuration
 * code: a 2-door configuration gets the group's `double` product.
 */
export function addonsFor(p: Product, configuration?: string): AddonOffer[] {
  let pair = false;
  let applies: (g: AddonGroup) => boolean;
  if (p.type === "door") {
    const c = p.configurations.find((x) => x.code === configuration);
    if (!c) return [];
    pair = c.leaves > 1;
    applies = (g) => g.customConfigurations.includes(c.code);
  } else {
    applies = (g) => g.categories.includes(productCategory(p));
  }
  const out: AddonOffer[] = [];
  for (const g of addonGroups) {
    const src = pair ? g.double : g.single;
    if (!src || !applies(g)) continue;
    const ap = getProduct(src.product, { includeUnlisted: true });
    if (ap?.type !== "standard") continue;
    out.push({
      key: g.key,
      label: g.label,
      description: g.description,
      note: g.note,
      product: { handle: ap.handle, title: ap.title, optionNames: ap.optionNames, variants: ap.variants },
      fixed: src.options,
    });
  }
  return out;
}

export interface PricedAddon {
  key: string;
  label: string;
  details: string;
  price: number;
}

export interface PricedLine {
  id: string;
  handle: string;
  title: string;
  href: string;
  image?: { src: string; alt: string };
  /** Short lines describing the choices, e.g. "Door Size: 30\" X 80\"". */
  details: string[];
  addons: PricedAddon[];
  /** Price of one, including add-ons. */
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  sku: string;
  category: string;
}

export interface PricedCart {
  lines: PricedLine[];
  /** Items that couldn't be priced (gone from the catalog, sold out, bad size...). */
  errors: { id: string; title: string; message: string }[];
  subtotal: number;
  shipping: { fee: number; method: ShippingMethod };
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function priceAddons(offers: AddonOffer[], chosen: CartItem["addons"]): PricedAddon[] | string {
  const out: PricedAddon[] = [];
  const seen = new Set<string>();
  for (const a of chosen) {
    if (seen.has(a.key)) return "An add-on was chosen twice.";
    seen.add(a.key);
    const offer = offers.find((o) => o.key === a.key);
    if (!offer) return "An add-on isn't available for this item.";
    const v = offer.product.variants.find((x) => x.sku === a.sku);
    if (!v || Object.entries(offer.fixed).some(([k, val]) => v.options[k] !== val)) return `${offer.label}: that option isn't available.`;
    if (!v.available) return `${offer.label}: that option is sold out.`;
    const picked = offer.product.optionNames.filter((n) => !(n in offer.fixed)).map((n) => v.options[n]);
    out.push({ key: offer.key, label: offer.label, details: picked.join(", "), price: v.price });
  }
  return out;
}

function priceItem(item: CartItem): PricedLine | string {
  const p = getProduct(item.handle);
  if (!p) return "This product is no longer available.";
  const base = { id: item.id, handle: p.handle, title: p.title, href: `/products/${p.handle}`, image: p.images[0], quantity: item.quantity, category: productCategory(p) };

  if (p.type === "door") {
    if (!item.door) return "Missing door choices.";
    const q = quoteDoor(p, { ...item.door, quantity: item.quantity });
    if (!q.ok) return q.message;
    const addons = priceAddons(addonsFor(p, item.door.configuration), item.addons);
    if (typeof addons === "string") return addons;
    const c = p.configurations.find((x) => x.code === item.door!.configuration)!;
    const s = p.styles.find((x) => x.code === item.door!.style)!;
    const g = p.grades.find((x) => x.code === item.door!.grade)!;
    const unit = round2(q.unitPrice + addons.reduce((a, x) => a + x.price, 0));
    return {
      ...base,
      image: s.image ? { src: s.image, alt: `${s.name} door` } : base.image,
      details: [`${c.name} · ${s.name} · ${g.name}`, `Opening ${formatInches(item.door.widthIn)} × ${formatInches(item.door.heightIn)}`, ...(q.oversize ? ["Oversize"] : [])],
      addons,
      unitPrice: unit,
      lineTotal: round2(unit * item.quantity),
      sku: q.sku,
    };
  }

  if (p.type === "standard") {
    const v = p.variants.find((x) => x.sku === item.sku);
    if (!v) return "That option is no longer available.";
    if (!v.available) return "That option is sold out.";
    const addons = priceAddons(addonsFor(p), item.addons);
    if (typeof addons === "string") return addons;
    const unit = round2(v.price + addons.reduce((a, x) => a + x.price, 0));
    return {
      ...base,
      details: p.optionNames.map((n) => `${n}: ${v.options[n]}`),
      addons,
      unitPrice: unit,
      lineTotal: round2(unit * item.quantity),
      sku: v.sku,
    };
  }

  return "This product can't be ordered online yet.";
}

/** Prices a cart from the catalog. The only place order prices are worked out. */
export function priceCart(items: CartItem[]): PricedCart {
  const lines: PricedLine[] = [];
  const errors: PricedCart["errors"] = [];
  for (const item of items) {
    const r = priceItem(item);
    if (typeof r === "string") errors.push({ id: item.id, title: getProduct(item.handle)?.title ?? "An item", message: r });
    else lines.push(r);
  }
  const subtotal = round2(lines.reduce((a, l) => a + l.lineTotal, 0));
  const shipping = shippingFee(subtotal, lines.map((l) => l.category), store.shipping);
  return { lines, errors, subtotal, shipping, total: round2(subtotal + shipping.fee) };
}
