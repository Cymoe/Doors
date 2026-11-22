import { z } from "zod";
import { MAX_QUANTITY } from "./pricing";

/**
 * What the browser keeps in the cart and sends to the server. It holds only
 * choices (product, SKU, door size, add-on SKUs), never prices: the server
 * prices every cart from the catalog.
 */
export const cartItem = z.object({
  /** Random id for this cart line. */
  id: z.string().min(1).max(64),
  handle: z.string().min(1).max(200),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  /** Catalog products: the chosen variant. */
  sku: z.string().max(100).optional(),
  /** The custom door: its choices and opening size. */
  door: z
    .object({
      configuration: z.string().max(20),
      grade: z.string().max(20),
      style: z.string().max(20),
      widthIn: z.number(),
      heightIn: z.number(),
    })
    .optional(),
  /** Chosen add-ons: the add-on group key and the add-on product's SKU. */
  addons: z.array(z.object({ key: z.string().max(40), sku: z.string().max(100) })).max(10).default([]),
});

export const cartBody = z.object({ items: z.array(cartItem).max(50) });

export type CartItem = z.infer<typeof cartItem>;
