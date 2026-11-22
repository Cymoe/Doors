import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn(async (_params: Record<string, unknown>) => ({ url: "https://checkout.stripe.com/c/test" }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create } };
  },
}));

const { POST } = await import("../src/app/api/checkout/route");
const { priceCart, addonsFor } = await import("../src/cart");
const { getProduct } = await import("../src/catalog");

const req = (body: unknown) =>
  new Request("http://localhost:3000/api/checkout", { method: "POST", body: JSON.stringify(body) });

const doubleDoor = {
  id: "a",
  handle: "solid-pine-interior-door",
  quantity: 1,
  door: { configuration: "DBL", grade: "CLR", style: "2PAR", widthIn: 60, heightIn: 80 },
  addons: [],
};
const latch = getProduct("privacy-latch");
if (latch?.type !== "standard") throw new Error("expected the imported privacy latch");
const latchItem = { id: "b", handle: "privacy-latch", sku: latch.variants[0]!.sku, quantity: 2, addons: [] };

describe("priceCart", () => {
  it("prices custom doors and catalog products, and adds freight", () => {
    const c = priceCart([doubleDoor, latchItem]);
    expect(c.errors).toEqual([]);
    // Double door, arch top: 995 + 2×125
    expect(c.lines[0]).toMatchObject({ unitPrice: 1245, lineTotal: 1245, sku: "PINE-DBL-CLR-2PAR" });
    expect(c.lines[1]).toMatchObject({ unitPrice: latch.variants[0]!.price, quantity: 2 });
    expect(c.subtotal).toBe(1245 + latch.variants[0]!.price * 2);
    expect(c.shipping.method).toBe("freight");
    expect(c.total).toBe(c.subtotal + c.shipping.fee);
  });

  it("ships a hardware-only cart by parcel", () => {
    expect(priceCart([latchItem]).shipping.method).toBe("parcel");
  });

  it("adds a double jamb kit and bore to a double door, and refuses mismatched add-ons", () => {
    const door = getProduct("solid-pine-interior-door")!;
    const offers = addonsFor(door, "DBL");
    expect(offers.map((o) => o.key)).toEqual(["jamb", "bore"]);
    const jamb = offers.find((o) => o.key === "jamb")!;
    expect(jamb.product.handle).toBe("jamb-kit-double-door");
    const bore = offers.find((o) => o.key === "bore")!;
    const doubleBore = bore.product.variants.find((v) => v.options["Door Configuration"] === "Double Door")!;
    const singleBore = bore.product.variants.find((v) => v.options["Door Configuration"] === "Single Door")!;
    const jambV = jamb.product.variants[0]!;

    const ok = priceCart([{ ...doubleDoor, addons: [{ key: "jamb", sku: jambV.sku }, { key: "bore", sku: doubleBore.sku }] }]);
    expect(ok.errors).toEqual([]);
    expect(ok.lines[0]!.unitPrice).toBe(1245 + jambV.price + doubleBore.price);

    // A single-door bore on a pair isn't allowed.
    expect(priceCart([{ ...doubleDoor, addons: [{ key: "bore", sku: singleBore.sku }] }]).errors).toHaveLength(1);
    // Barn doors offer no add-ons.
    expect(addonsFor(door, "BARN")).toEqual([]);
    const barn = { ...doubleDoor, door: { ...doubleDoor.door, configuration: "BARN", widthIn: 36 } };
    expect(priceCart([{ ...barn, addons: [{ key: "jamb", sku: jambV.sku }] }]).errors).toHaveLength(1);
  });

  it("reports items it can't price instead of guessing", () => {
    const c = priceCart([
      { ...latchItem, sku: "NOPE" },
      { ...doubleDoor, door: { ...doubleDoor.door, widthIn: 200 } },
      { ...latchItem, id: "z", handle: "not-a-product" },
    ]);
    expect(c.lines).toEqual([]);
    expect(c.errors.map((e) => e.id)).toEqual(["b", "a", "z"]);
  });
});

describe("POST /api/checkout", () => {
  beforeEach(() => {
    create.mockClear();
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  });
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("sends one Stripe line per cart line, priced on the server, plus shipping", async () => {
    const res = await POST(req({ items: [{ ...doubleDoor, price: 1 }, latchItem] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/test" });
    const params = create.mock.calls[0]![0] as any;
    expect(params.line_items).toHaveLength(2);
    expect(params.line_items[0]).toMatchObject({ quantity: 1, price_data: { unit_amount: 124500 } });
    expect(params.line_items[0].price_data.product_data.description).toContain('Opening 60" × 80"');
    expect(params.line_items[1]).toMatchObject({ quantity: 2, price_data: { unit_amount: Math.round(latch.variants[0]!.price * 100) } });
    const expected = priceCart([doubleDoor, latchItem]);
    expect(params.shipping_options[0].shipping_rate_data.fixed_amount.amount).toBe(Math.round(expected.shipping.fee * 100));
    expect(params.shipping_address_collection).toEqual({ allowed_countries: ["US"] });
  });

  it("refuses an empty cart, a bad body, and carts with problems", async () => {
    expect((await POST(req({ items: [] }))).status).toBe(400);
    expect((await POST(req({ nope: true }))).status).toBe(400);
    expect((await POST(req({ items: [{ ...latchItem, sku: "NOPE" }] }))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("marks prices as before-tax when Stripe Tax is on", async () => {
    process.env.STRIPE_AUTOMATIC_TAX = "true";
    try {
      await POST(req({ items: [doubleDoor] }));
      const params = create.mock.calls[0]![0] as any;
      expect(params.automatic_tax).toEqual({ enabled: true });
      expect(params.line_items[0].price_data.tax_behavior).toBe("exclusive");
      expect(params.shipping_options[0].shipping_rate_data.tax_behavior).toBe("exclusive");
    } finally {
      delete process.env.STRIPE_AUTOMATIC_TAX;
    }
  });

  it("says checkout isn't set up when there's no Stripe key", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect((await POST(req({ items: [latchItem] }))).status).toBe(503);
  });
});
