import type { DoorProduct, StoreConfig } from "./schema";

/**
 * Door pricing, shared by the product page (live price) and the checkout API
 * (which re-computes it, so a price sent from the browser is never trusted).
 */

export interface DoorSelection {
  configuration: string; // configuration code, e.g. "SGL"
  grade: string; // grade code, e.g. "CLR"
  style: string; // style code, e.g. "SHK"
  widthIn: number; // opening width, inches
  heightIn: number; // opening height, inches
  quantity: number;
}

export interface PriceLine {
  label: string;
  amount: number;
}

export type DoorQuote =
  | {
      ok: true;
      sku: string;
      unitPrice: number;
      lines: PriceLine[];
      leaves: number;
      slabWidthIn: number;
      oversize: boolean;
      summary: string;
    }
  /** `invalid`: a bad selection. `quote`: buildable, but priced by hand. */
  | { ok: false; reason: "invalid" | "quote"; message: string };

export const MAX_QUANTITY = 10;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Formats inches like 32.5 → 32 1/2". Rounds to the nearest 1/16. */
export function formatInches(n: number): string {
  const sixteenths = Math.round(n * 16);
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16;
  if (num === 0) return `${whole}"`;
  let den = 16;
  while (num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return whole ? `${whole} ${num}/${den}"` : `${num}/${den}"`;
}

/** Parses "32", "32.5", "32 1/2", "32-1/2" or "32 1/2\"" into inches. */
export function parseInches(input: string): number | undefined {
  const s = input.trim().replace(/["”]|in(ches)?$/gi, "").trim();
  let m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]);
  m = s.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/);
  if (m && Number(m[3]) > 0) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m && Number(m[2]) > 0) return Number(m[1]) / Number(m[2]);
  return undefined;
}

export function quoteDoor(p: DoorProduct, sel: DoorSelection): DoorQuote {
  const c = p.configurations.find((x) => x.code === sel.configuration);
  const g = p.grades.find((x) => x.code === sel.grade);
  const s = p.styles.find((x) => x.code === sel.style);
  if (!c || !g || !s) return { ok: false, reason: "invalid", message: "Choose a configuration, wood and style." };

  const excluded = p.exclude.some(
    (e) =>
      (e.configuration === undefined || e.configuration === c.code) &&
      (e.grade === undefined || e.grade === g.code) &&
      (e.style === undefined || e.style === s.code),
  );
  if (excluded) {
    return { ok: false, reason: "invalid", message: `${s.name} isn't available as a ${c.name.toLowerCase()}.` };
  }
  if (!Number.isInteger(sel.quantity) || sel.quantity < 1 || sel.quantity > MAX_QUANTITY) {
    return { ok: false, reason: "invalid", message: `Quantity must be 1 to ${MAX_QUANTITY}.` };
  }
  if (!(sel.widthIn > 0) || !(sel.heightIn > 0)) {
    return { ok: false, reason: "invalid", message: "Enter the opening width and height." };
  }

  const { min, standard, oversize } = p.sizing;
  const slabWidthIn = sel.widthIn / c.leaves;
  if (slabWidthIn < min.width || sel.heightIn < min.height) {
    return {
      ok: false,
      reason: "quote",
      message: `That's smaller than we price online (each door at least ${formatInches(min.width)} wide and ${formatInches(min.height)} tall). Send us the size for a quote.`,
    };
  }
  if (slabWidthIn > oversize.width || sel.heightIn > oversize.height) {
    return {
      ok: false,
      reason: "quote",
      message: `That's larger than we price online (each door up to ${formatInches(oversize.width)} wide and ${formatInches(oversize.height)} tall). Send us the size for a quote.`,
    };
  }
  const isOversize = slabWidthIn > standard.width || sel.heightIn > standard.height;

  const per = c.leaves > 1 ? ` × ${c.leaves} doors` : "";
  const lines: PriceLine[] = [{ label: c.name, amount: c.basePrice }];
  if (g.adder) lines.push({ label: `${g.name}${per}`, amount: g.adder * c.leaves });
  if (s.adder) lines.push({ label: `${s.name}${per}`, amount: s.adder * c.leaves });
  if (isOversize) lines.push({ label: `Oversize${per}`, amount: oversize.adderPerLeaf * c.leaves });

  return {
    ok: true,
    sku: [p.skuPrefix, c.code, g.code, s.code].join("-"),
    unitPrice: round2(lines.reduce((a, l) => a + l.amount, 0)),
    lines,
    leaves: c.leaves,
    slabWidthIn,
    oversize: isOversize,
    summary: `${c.name}, ${g.name}, ${s.name}, ${formatInches(sel.widthIn)} × ${formatInches(sel.heightIn)} opening`,
  };
}

export type ShippingMethod = "free" | "freight" | "parcel";

/**
 * Shipping for an order: free at or over `freeOver`; parcel rate when every
 * item is in a parcel category (e.g. hardware only); otherwise the freight
 * tier for the subtotal.
 */
export function shippingFee(
  subtotal: number,
  categories: string[],
  shipping: StoreConfig["shipping"],
): { fee: number; method: ShippingMethod } {
  if (subtotal <= 0) return { fee: 0, method: "free" };
  if (subtotal >= shipping.freeOver) return { fee: 0, method: "free" };
  if (shipping.parcel && categories.length && categories.every((c) => shipping.parcel!.categories.includes(c as never))) {
    return { fee: shipping.parcel.fee, method: "parcel" };
  }
  const tier = shipping.freight.find((t) => subtotal < t.under) ?? shipping.freight[shipping.freight.length - 1]!;
  return { fee: tier.fee, method: "freight" };
}

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 ? 2 : 0 });
