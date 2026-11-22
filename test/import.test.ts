import { describe, expect, it } from "vitest";
import { categorize, htmlToText, isGlassOrLouver, toCatalogProduct } from "../src/import-shopify";
import { product } from "../src/schema";

describe("categorize", () => {
  it.each([
    ["single-panel-shaker-style-door", "Pine", "interior"],
    ["z-brace-barn-door", "Pine", "barn"],
    ["2-louver-panel-bifold-door", "Pine", "bifold"],
    ["prehung-10-lite-french-interior-door", "", "prehung"],
    ["exterior-fir-15-lite", "Fir", "exterior"],
    ["full-lite-sidelite", "Pine", "exterior"],
    ["onyx-passage-lever", "Hardware", "hardware"],
    ["johnson-1500-pocket-door-kit", "Pocket Doors", "hardware"],
    ["minot-gray-oak-luxury-vinyl-spc-flooring", "", "flooring"],
  ])("%s → %s", (handle, product_type, want) => expect(categorize({ handle, product_type })).toBe(want));

  it.each([
    ["processing-fee", "mws_fee_generated"],
    ["4-5-8-interior-single-door-jamb-kit-primed", "OPTIONS_HIDDEN_PRODUCT"],
    ["jamb-kit-single-door", ""],
    ["test", ""],
    ["custom-options-for-10-lite-french-door_abc", "mw_product_option"],
  ])("skips %s", (handle, product_type) => expect(categorize({ handle, product_type })).toBeUndefined());
});

describe("htmlToText", () => {
  it("keeps paragraphs and bullets, drops tags, decodes entities", () => {
    expect(htmlToText("<p>Solid&nbsp;pine &amp; <b>clear</b></p><ul><li>One</li><li>Two&#39;s</li></ul>")).toBe(
      "Solid pine & clear\n\n• One\n\n• Two's",
    );
  });
});

describe("toCatalogProduct", () => {
  it("maps options and variants and passes the schema", () => {
    const out = toCatalogProduct(
      {
        handle: "x-door",
        title: " X Door ",
        body_html: "<p>Nice</p>",
        product_type: "Pine",
        tags: ["Doors", "tab_Pine"],
        options: [{ name: "Select Door Size", position: 1, values: ["24x80", "30x80"] }],
        variants: [
          { id: 1, sku: "A", price: "100.00", compare_at_price: "120.00", option1: "24x80", option2: null, option3: null },
          { id: 2, sku: "A", price: "110.00", compare_at_price: null, option1: "30x80", option2: null, option3: null },
        ],
        images: [],
      },
      "interior",
      [{ src: "/images/products/x-door/1.jpg", alt: "X" }],
    );
    expect(out.optionNames).toEqual(["Door Size"]);
    expect(out.variants).toEqual([
      { sku: "A", options: { "Door Size": "24x80" }, price: 100, compareAtPrice: 120 },
      { sku: "DTD-2", options: { "Door Size": "30x80" }, price: 110 },
    ]);
    expect(out.tags).toEqual(["Doors"]);
    expect(product.safeParse(out).success).toBe(true);
  });
});

describe("no primed products", () => {
  it("drops primed choices from a product's variants", () => {
    const out = toCatalogProduct(
      {
        handle: "jamb",
        title: "Jamb",
        body_html: "",
        product_type: "",
        tags: [],
        options: [{ name: "Finish", position: 1, values: ["Clear", "Primed"] }],
        variants: [
          { id: 1, sku: "C", price: "100", compare_at_price: null, option1: "Clear", option2: null, option3: null },
          { id: 2, sku: "P", price: "90", compare_at_price: null, option1: "Primed", option2: null, option3: null },
        ],
        images: [],
      },
      "hardware",
      [],
    );
    expect(out.variants.map((v) => v.sku)).toEqual(["C"]);
  });

  it("has nothing primed, glass, mirrored or louvered in the catalog", async () => {
    const { loadCatalog } = await import("../src/load");
    const { products } = await loadCatalog();
    for (const { product: p } of products) {
      expect(p.title).not.toMatch(/primed|lite|glass|french|mirror|frosted|louver/i);
      if (p.type === "door") expect(p.styles.map((s) => s.name).join(" ")).not.toMatch(/glass|mirror|louver/i);
      if (p.type === "standard") {
        for (const v of p.variants) expect(Object.values(v.options).join(" ")).not.toMatch(/primed/i);
      }
    }
  });
});

describe("isGlassOrLouver", () => {
  it.each(["15-lite-french-door", "Single Lite Exterior Door", "5 Lite Sidelite", "louver-over-raised-panel-door", "Mirrored Bypass Door"])(
    "skips %s",
    (s) => expect(isGlassOrLouver(s)).toBe(true),
  );
  it.each(["Elite Leverset", "satellite-hinge", "2 Panel Shaker Style Door"])("keeps %s", (s) => expect(isGlassOrLouver(s)).toBe(false));
});
