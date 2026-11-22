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

const image = z.object({
  src: z.string().url(),
  alt: z.string().default(""),
});

/** A spec shown on the product page; becomes a Shopify metafield. */
const specValue = z.union([z.string(), z.number(), z.boolean()]);

const baseProduct = z.object({
  handle,
  title: z.string().min(1),
  /** draft products are created in Shopify but are not visible on the store. */
  status: z.enum(["active", "draft", "archived"]).default("draft"),
  vendor: z.string().optional(),
  /** Paragraphs separated by blank lines. Plain text; it is HTML-escaped. */
  description: z.string().min(1),
  /** Bullet points rendered under the description. */
  highlights: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  images: z.array(image).default([]),
  specs: z.record(z.string().regex(/^[a-z0-9_]+$/), specValue).default({}),
  seo: z
    .object({ title: z.string().max(70).optional(), description: z.string().max(320).optional() })
    .optional(),
});

const namedAdder = z.object({ name: z.string().min(1), code: z.string().regex(/^[A-Z0-9]+$/), adder });

/**
 * Made-to-order doors. Variants are generated from every combination of
 * configuration × wood grade × style, priced as
 * configuration base price + grade adder + style adder.
 * Exact opening size is captured at checkout / in the quote, not as a variant.
 */
export const doorProduct = baseProduct.extend({
  type: z.literal("door"),
  skuPrefix: z.string().regex(/^[A-Z0-9]+$/),
  configurations: z
    .array(z.object({ name: z.string().min(1), code: z.string().regex(/^[A-Z0-9]+$/), basePrice: money }))
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
  madeToOrder: z
    .object({
      customSize: z.boolean().default(true),
      leadTimeWeeks: z.number().int().positive().optional(),
    })
    .default({}),
});

/**
 * Products sold by the box with a square-foot coverage (flooring, tile).
 * Each listed variant is a box. The store shows price per sq ft from the
 * metafields; Shopify charges per box.
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
  /** Option names in display order, max 3 (Shopify limit). */
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
    if (p.type === "door") return;
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
  vendor: z.string().min(1),
  /** Namespace for product metafields in Shopify. */
  metafieldNamespace: z.string().regex(/^[a-z0-9_]+$/).default("catalog"),
});

export type DoorProduct = z.infer<typeof doorProduct>;
export type FlooringProduct = z.infer<typeof flooringProduct>;
export type TileProduct = z.infer<typeof tileProduct>;
export type Product = z.infer<typeof product>;
export type StoreConfig = z.infer<typeof storeConfig>;
