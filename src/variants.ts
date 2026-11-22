import type { DoorProduct, Product } from "./schema.js";

export interface Variant {
  sku: string;
  /** Option name → value, in the product's option order. */
  options: [name: string, value: string][];
  price: number;
  compareAtPrice?: number;
  /** Extra per-variant facts stored as variant metafields. */
  meta: Record<string, number>;
}

export interface BuiltProduct {
  optionNames: string[];
  variants: Variant[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildVariants(p: Product): BuiltProduct {
  return p.type === "door" ? buildDoorVariants(p) : buildBoxVariants(p);
}

function buildDoorVariants(p: DoorProduct): BuiltProduct {
  const variants: Variant[] = [];
  for (const c of p.configurations) {
    for (const g of p.grades) {
      for (const s of p.styles) {
        const excluded = p.exclude.some(
          (e) =>
            (e.configuration === undefined || e.configuration === c.code) &&
            (e.grade === undefined || e.grade === g.code) &&
            (e.style === undefined || e.style === s.code),
        );
        if (excluded) continue;
        variants.push({
          sku: [p.skuPrefix, c.code, g.code, s.code].join("-"),
          options: [
            ["Configuration", c.name],
            ["Wood", g.name],
            ["Style", s.name],
          ],
          price: round2(c.basePrice + g.adder + s.adder),
          meta: {},
        });
      }
    }
  }
  return { optionNames: ["Configuration", "Wood", "Style"], variants };
}

function buildBoxVariants(p: Extract<Product, { type: "flooring" | "tile" }>): BuiltProduct {
  return {
    optionNames: p.optionNames,
    variants: p.variants.map((v) => ({
      sku: v.sku,
      options: p.optionNames.map((n) => [n, v.options[n]!] as [string, string]),
      price: round2(v.pricePerSqFt * v.sqFtPerBox),
      compareAtPrice:
        v.compareAtPricePerSqFt === undefined ? undefined : round2(v.compareAtPricePerSqFt * v.sqFtPerBox),
      meta: { price_per_sqft: v.pricePerSqFt, sqft_per_box: v.sqFtPerBox },
    })),
  };
}

/** Checks that apply to the built variants rather than the raw file. */
export function checkVariants(p: Product, built: BuiltProduct): string[] {
  const problems: string[] = [];
  if (built.variants.length === 0) problems.push("no variants (everything excluded?)");
  if (built.variants.length > 2048) problems.push(`${built.variants.length} variants; Shopify allows 2048`);
  const skus = new Set<string>();
  const combos = new Set<string>();
  for (const v of built.variants) {
    if (skus.has(v.sku)) problems.push(`duplicate SKU ${v.sku}`);
    skus.add(v.sku);
    const combo = v.options.map(([, val]) => val).join(" / ");
    if (combos.has(combo)) problems.push(`duplicate option combination ${combo}`);
    combos.add(combo);
    if (v.price <= 0) problems.push(`${v.sku} has price ${v.price}`);
  }
  if (p.status === "active" && p.images.length === 0) problems.push("active product has no images");
  return problems;
}
