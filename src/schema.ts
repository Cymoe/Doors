import { z } from "zod";

/**
 * Catalog schema. Every product file in catalog/products/** is one of these
 * product types, picked by its `type` field. Add a new line of business
 * (e.g. trim, hardware) by adding a schema here and a variant builder in
 * variants.ts.
 */

const handle = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "lowercase letters, numbers, dashes and underscores only");

const money = z.number().nonnegative().multipleOf(0.01);
/** A price change relative to a base price; may be negative (e.g. a cheaper wood grade). */
const adder = z.number().multipleOf(0.01).default(0);
const code = z.string().regex(/^[A-Z0-9]+$/, "capital letters and numbers only");

const image = z.object({
  /** A full URL, or a path under public/ such as /images/doors/pine-shaker.jpg */
  src: z.string().regex(/^(https?:\/\/|\/)/, "full URL or a path starting with /"),
  alt: z.string().default(""),
});

const specValue = z.union([z.string(), z.number(), z.boolean()]);

/** Store sections, in the order they're shown in the catalog. */
export const CATEGORIES = {
  interior: "Interior Doors",
  barn: "Barn Doors",
  bifold: "Bifold & Closet Doors",
  prehung: "Prehung Doors",
  exterior: "Exterior Doors",
  hardware: "Hardware",
  flooring: "Flooring",
  tile: "Tile",
} as const;
export type Category = keyof typeof CATEGORIES;
const category = z.enum(Object.keys(CATEGORIES) as [Category, ...Category[]]);

const baseProduct = z.object({
  handle,
  title: z.string().min(1),
  /** Only active products are shown on the site. */
  status: z.enum(["active", "draft", "archived"]).default("draft"),
  /** Store section. Defaults by type: doors → interior, flooring → flooring, tile → tile. */
  category: category.optional(),
  /** false = not shown in the catalog or given a page (e.g. add-ons like jamb kits). */
  listed: z.boolean().default(true),
  /** Short line under the title on catalog cards, e.g. "Built to your opening". */
  cardNote: z.string().optional(),
  /** Paragraphs separated by blank lines. Plain text. */
  description: z.string().min(1),
  /** Bullet points shown under the description. */
  highlights: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  images: z.array(image).default([]),
  /** Shown as a spec table on the product page. Keys are snake_case labels. */
  specs: z.record(z.string().regex(/^[a-z0-9_]+$/), specValue).default({}),
  seo: z
    .object({ title: z.string().max(70).optional(), description: z.string().max(320).optional() })
    .optional(),
});

/** A photo for an option card: a path under public/, e.g. /images/doors/style-shaker.jpg */
const optionImage = z.string().regex(/^(https?:\/\/|\/)/).optional();
const namedAdder = z.object({ name: z.string().min(1), code, adder, note: z.string().optional(), image: optionImage });
const dims = z.object({ width: z.number().positive(), height: z.number().positive() });

/**
 * Made-to-order doors. Variants are every combination of
 * configuration × wood grade × style, priced as
 * configuration base price + leaves × (grade adder + style adder [+ oversize adder]).
 */
export const doorProduct = baseProduct.extend({
  type: z.literal("door"),
  skuPrefix: code,
  configurations: z
    .array(
      z.object({
        name: z.string().min(1),
        code,
        basePrice: money,
        /** Number of door slabs; grade, style and oversize adders are charged per slab. */
        leaves: z.number().int().positive().default(1),
        note: z.string().optional(),
        image: optionImage,
      }),
    )
    .min(1),
  grades: z.array(namedAdder).min(1),
  styles: z.array(namedAdder).min(1),
  /** Combinations that can't be built, e.g. { configuration: "POCKET", style: "MIR" }. */
  exclude: z
    .array(
      z.object({
        configuration: z.string().optional(),
        grade: z.string().optional(),
        style: z.string().optional(),
      }),
    )
    .default([]),
  /**
   * Size rules in inches, per door slab (a double door's opening width is
   * split between its two slabs). Up to `standard` is the base price; up to
   * `oversize` adds `oversize.adderPerLeaf` per slab; anything larger, or
   * smaller than `min`, goes to "request a quote".
   */
  sizing: z.object({
    min: dims,
    standard: dims,
    oversize: dims.extend({ adderPerLeaf: money }),
  }),
  leadTimeWeeks: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }).optional(),
});

/**
 * Products sold by the box with a square-foot coverage (flooring, tile).
 * Each variant is a box; the box price is price per sq ft × sq ft per box.
 */
const boxVariant = z.object({
  sku: z.string().min(1),
  /** Option values, keyed by option name, e.g. { Color: "Natural Oak" }. */
  options: z.record(z.string(), z.string()),
  pricePerSqFt: money,
  sqFtPerBox: z.number().positive(),
  compareAtPricePerSqFt: money.optional(),
});

const boxProduct = baseProduct.extend({
  /** Option names in display order. */
  optionNames: z.array(z.string()).min(1).max(3),
  variants: z.array(boxVariant).min(1),
  /** Suggested overage for cuts and waste, as a percent. */
  wastePercent: z.number().min(0).max(50).default(10),
});

export const flooringProduct = boxProduct.extend({ type: z.literal("flooring") });
export const tileProduct = boxProduct.extend({ type: z.literal("tile") });

/**
 * A product with fixed variants and prices (e.g. a stock door in set sizes,
 * a hinge in several finishes). Each variant lists its option values.
 * optionNames may be empty for a product with a single variant.
 */
export const standardProduct = baseProduct.extend({
  type: z.literal("standard"),
  optionNames: z.array(z.string().min(1)).max(3),
  variants: z
    .array(
      z.object({
        sku: z.string().min(1),
        options: z.record(z.string(), z.string()),
        price: money,
        compareAtPrice: money.optional(),
        available: z.boolean().default(true),
      }),
    )
    .min(1),
});

export const product = z
  .discriminatedUnion("type", [doorProduct, flooringProduct, tileProduct, standardProduct])
  .superRefine((p, ctx) => {
    if (p.type === "door") {
      const { min, standard, oversize } = p.sizing;
      if (!(min.width <= standard.width && standard.width <= oversize.width) ||
          !(min.height <= standard.height && standard.height <= oversize.height)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sizing"], message: "sizes must grow: min ≤ standard ≤ oversize" });
      }
      return;
    }
    if (p.type === "standard" && p.optionNames.length === 0 && p.variants.length > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["optionNames"], message: "more than one variant needs option names" });
    }
    p.variants.forEach((v, i) => {
      const keys = Object.keys(v.options).sort().join("|");
      if (keys !== [...p.optionNames].sort().join("|")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variants", i, "options"],
          message: `variant options must be exactly: ${p.optionNames.join(", ")}`,
        });
      }
    });
  });

/** Shipping fee by order subtotal: the first tier whose `under` is above the subtotal applies. */
const shipping = z
  .object({
    /** Where you ship, shown in the cart. */
    area: z.string(),
    freeOver: money,
    freight: z.array(z.object({ under: money, fee: money })).min(1),
    /** Orders made up only of these categories (small items) ship by parcel for this fee. */
    parcel: z.object({ fee: money, categories: z.array(category) }).optional(),
    /** Shown in the cart and on product pages, e.g. processing times. */
    note: z.string().optional(),
  })
  .superRefine((s, ctx) => {
    const unders = s.freight.map((t) => t.under);
    if (unders.some((u, i) => i > 0 && u <= unders[i - 1]!)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["freight"], message: "tiers must go up by `under`" });
    }
    if (unders[unders.length - 1]! < s.freeOver) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["freight"], message: "the last tier's `under` must reach freeOver" });
    }
  });

export const storeConfig = z.object({
  businessName: z.string().min(1),
  /** Logo image under public/, shown in the header. Falls back to the business name. */
  logo: z.string().optional(),
  tagline: z.string().default(""),
  contact: z.object({
    /** Where quote requests are sent. */
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  shipping,
  /** Categories hidden from the site (their products aren't shown or sold). */
  hiddenCategories: z.array(category).default([]),
});

/** Where an add-on comes from: an unlisted product, optionally with some options fixed. */
const addonSource = z.object({
  product: z.string(),
  /** Option values chosen for the customer, e.g. { "Door Configuration": "Double Door" }. */
  options: z.record(z.string(), z.string()).default({}),
});

/** Optional extras offered on door pages (jamb kit, bore hole, casing...). See catalog/addons.yaml. */
export const addonGroup = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  description: z.string().optional(),
  /** Shown with the add-on, e.g. extra processing time. */
  note: z.string().optional(),
  /** The product for a single door and for a pair (double door). Leave one out if not offered. */
  single: addonSource.optional(),
  double: addonSource.optional(),
  /** Catalog categories whose products offer it (they're single doors). */
  categories: z.array(category).default([]),
  /** Custom door configuration codes that offer it (single or double by the configuration's door count). */
  customConfigurations: z.array(z.string()).default([]),
});
export const addonsFile = z.object({ addons: z.array(addonGroup) });
export type AddonGroup = z.infer<typeof addonGroup>;

export type DoorProduct = z.infer<typeof doorProduct>;
export type FlooringProduct = z.infer<typeof flooringProduct>;
export type TileProduct = z.infer<typeof tileProduct>;
export type StandardProduct = z.infer<typeof standardProduct>;
export type Product = z.infer<typeof product>;

export function productCategory(p: Product): Category {
  return p.category ?? (p.type === "flooring" ? "flooring" : p.type === "tile" ? "tile" : "interior");
}
export type StoreConfig = z.infer<typeof storeConfig>;
