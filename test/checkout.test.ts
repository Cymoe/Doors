import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn(async (_params: Record<string, unknown>) => ({ url: "https://checkout.stripe.com/c/test" }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create } };
  },
}));

const { POST } = await import("../src/app/api/checkout/route");

const req = (body: unknown) =>
  new Request("http://localhost:3000/api/checkout", { method: "POST", body: JSON.stringify(body) });

const order = {
  handle: "solid-pine-interior-door",
  selection: { configuration: "FRP", grade: "CLR", style: "GLS", widthIn: 60, heightIn: 80, quantity: 1 },
  fulfillment: "delivery",
};

describe("POST /api/checkout", () => {
  beforeEach(() => {
    create.mockClear();
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  });
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("charges the deposit computed on the server", async () => {
    const res = await POST(req(order));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/test" });
    const params = create.mock.calls[0]![0] as any;
    // French pair with glass: 995 + 2×150 = 1295, + $75 delivery = 1370; 50% = 685
    expect(params.line_items[0].price_data.unit_amount).toBe(68500);
    expect(params.metadata).toMatchObject({
      sku: "PINE-FRP-CLR-GLS",
      opening_size: '60" x 80"',
      order_total: "1370.00",
      balance_due: "685.00",
      fulfillment: "delivery",
    });
    expect(params.shipping_address_collection).toEqual({ allowed_countries: ["US"] });
  });

  it("ignores any price sent by the browser", async () => {
    await POST(req({ ...order, price: 1, unitPrice: 1 }));
    expect((create.mock.calls[0]![0] as any).line_items[0].price_data.unit_amount).toBe(68500);
  });

  it("refuses sizes that need a quote", async () => {
    const res = await POST(req({ ...order, selection: { ...order.selection, widthIn: 100 } }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses unknown products and bad bodies", async () => {
    expect((await POST(req({ ...order, handle: "nope" }))).status).toBe(404);
    expect((await POST(req({ nope: true }))).status).toBe(400);
  });

  it("says checkout isn't set up when there's no Stripe key", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect((await POST(req(order))).status).toBe(503);
  });
});
