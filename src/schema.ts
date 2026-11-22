import { z } from "zod";

/**
 * Catalog schema. Every product file in catalog/products/** is one of these
 * product types, picked by its `type` field. Add a new line of business
 * (e.g. trim, hardware) by adding a schema here and a variant builder in
 * variants.ts.
 */

const handle = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, numbers and single dashes only");

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

const baseProduct = z.object({
  handle,
  title: z.string().min(1),
  /** Only active products are shown on the site. */
  status: z.enum(["active", "draft", "archived"]).default("draft"),
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

const namedAdder = z.object({ name: z.string().min(1), code, adder, note: z.string().optional() });
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
   * Size rules in inches, per door slab (a French pair's opening width is
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

export const product = z
  .discriminatedUnion("type", [doorProduct, flooringProduct, tileProduct])
  .superRefine((p, ctx) => {
    if (p.type === "door") {
      const { min, standard, oversize } = p.sizing;
      if (!(min.width <= standard.width && standard.width <= oversize.width) ||
          !(min.height <= standard.height && standard.height <= oversize.height)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sizing"], message: "sizes must grow: min ≤ standard ≤ oversize" });
      }
      return;
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

export const storeConfig = z.object({
  businessName: z.string().min(1),
  tagline: z.string().default(""),
  contact: z.object({
    /** Where quote requests are sent. */
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  /** Percent of the order total charged at checkout; the rest is due at pickup/delivery. 100 = pay in full. */
  depositPercent: z.number().int().min(1).max(100),
  pickup: z.object({ enabled: z.boolean(), location: z.string() }),
  localDelivery: z.object({ enabled: z.boolean(), fee: money, area: z.string() }),
});

export type DoorProduct = z.infer<typeof doorProduct>;
export type FlooringProduct = z.infer<typeof flooringProduct>;
export type TileProduct = z.infer<typeof tileProduct>;
export type Product = z.infer<typeof product>;
export type StoreConfig = z.infer<typeof storeConfig>;
