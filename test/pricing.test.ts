import { describe, expect, it } from "vitest";
import { parseProductFile } from "../src/load";
import { formatInches, orderTotals, parseInches, quoteDoor, type DoorSelection } from "../src/pricing";
import type { DoorProduct, StoreConfig } from "../src/schema";

const door = (await parseProductFile("catalog/products/doors/solid-pine-interior-door.yaml")) as DoorProduct;
const base: DoorSelection = { configuration: "SGL", grade: "CLR", style: "2PSQ", widthIn: 32, heightIn: 80, quantity: 1 };
const store: StoreConfig = {
  businessName: "Test",
  tagline: "",
  contact: { email: "a@example.com" },
  depositPercent: 50,
  pickup: { enabled: true, location: "Shop" },
  localDelivery: { enabled: true, fee: 75, area: "Town" },
};

describe("inches", () => {
  it.each([
    ["32", 32],
    ["32.5", 32.5],
    ["32 1/2", 32.5],
    ["32-1/2", 32.5],
    ['79 7/8"', 79.875],
    ["3/4", 0.75],
  ])("parses %s", (s, n) => expect(parseInches(s)).toBe(n));

  it.each(["", "abc", "32 1/0", "-5"])("rejects %j", (s) => expect(parseInches(s)).toBeUndefined());

  it("formats", () => {
    expect(formatInches(32)).toBe('32"');
    expect(formatInches(32.5)).toBe('32 1/2"');
    expect(formatInches(79.875)).toBe('79 7/8"');
  });
});

describe("quoteDoor", () => {
  it("prices a standard single at $495", () => {
    const q = quoteDoor(door, base);
    expect(q).toMatchObject({ ok: true, unitPrice: 495, sku: "PINE-SGL-CLR-2PSQ", oversize: false });
  });

  it("charges oversize per door", () => {
    expect(quoteDoor(door, { ...base, heightIn: 84 })).toMatchObject({ ok: true, unitPrice: 595, oversize: true });
    // French pair, 80" wide = two 40" doors: oversize on both
    expect(quoteDoor(door, { ...base, configuration: "FRP", widthIn: 80 })).toMatchObject({
      ok: true,
      unitPrice: 995 + 2 * 100,
      slabWidthIn: 40,
    });
    // 74" French pair = two 37" doors: standard
    expect(quoteDoor(door, { ...base, configuration: "FRP", widthIn: 74 })).toMatchObject({ unitPrice: 995 });
  });

  it("sends sizes outside the limits to a quote", () => {
    expect(quoteDoor(door, { ...base, widthIn: 48 })).toMatchObject({ ok: false, reason: "quote" });
    expect(quoteDoor(door, { ...base, heightIn: 100 })).toMatchObject({ ok: false, reason: "quote" });
    expect(quoteDoor(door, { ...base, heightIn: 40 })).toMatchObject({ ok: false, reason: "quote" });
  });

  it("rejects bad selections", () => {
    expect(quoteDoor(door, { ...base, style: "NOPE" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(quoteDoor(door, { ...base, quantity: 0 })).toMatchObject({ ok: false, reason: "invalid" });
    expect(quoteDoor(door, { ...base, quantity: 1.5 })).toMatchObject({ ok: false, reason: "invalid" });
    expect(quoteDoor(door, { ...base, widthIn: NaN })).toMatchObject({ ok: false, reason: "invalid" });
    const d = { ...door, exclude: [{ configuration: "POCKET", style: "LOUV" }] };
    expect(quoteDoor(d, { ...base, configuration: "POCKET", style: "LOUV" })).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("orderTotals", () => {
  it("splits deposit and balance, including delivery", () => {
    expect(orderTotals(495, 2, "delivery", store)).toEqual({
      subtotal: 990,
      delivery: 75,
      total: 1065,
      dueNow: 532.5,
      balance: 532.5,
    });
    expect(orderTotals(495, 1, "pickup", { ...store, depositPercent: 100 })).toMatchObject({ dueNow: 495, balance: 0 });
  });
});
