import { describe, expect, it } from "vitest";
import { loadCatalog, parseProductFile } from "../src/load.js";
import { buildVariants, checkVariants } from "../src/variants.js";
import { descriptionHtml, toProductSetInput } from "../src/shopify/mapProduct.js";
import { syncProduct } from "../src/shopify/sync.js";
import type { ShopifyClient } from "../src/shopify/client.js";
import type { DoorProduct } from "../src/schema.js";

const store = { vendor: "Test Co", metafieldNamespace: "catalog" };

describe("catalog files", () => {
  it("loads with no errors", async () => {
    const { products, errors } = await loadCatalog();
    expect(errors).toEqual([]);
    expect(products.length).toBeGreaterThan(0);
    for (const { product } of products) expect(checkVariants(product, buildVariants(product))).toEqual([]);
  });

  it.each(["flooring", "tile"])("%s template is valid", async (t) => {
    const p = await parseProductFile(`catalog/_templates/${t}.yaml`);
    expect(checkVariants(p, buildVariants(p))).toEqual([]);
  });
});

describe("door variants", () => {
  it("prices singles from $495 and French pairs from $995", async () => {
    const door = (await parseProductFile("catalog/products/doors/solid-pine-interior-door.yaml")) as DoorProduct;
    const v = buildVariants(door).variants;
    const min = (cfg: string) => Math.min(...v.filter((x) => x.options[0]![1] === cfg).map((x) => x.price));
    expect(min("Single")).toBe(495);
    expect(min("French Pair")).toBe(995);
  });

  it("applies adders and exclusions", async () => {
    const door = (await parseProductFile("catalog/products/doors/solid-pine-interior-door.yaml")) as DoorProduct;
    door.grades = [{ name: "Knotty", code: "KNT", adder: -50 }];
    door.styles = [
      { name: "Shaker", code: "SHK", adder: 0 },
      { name: "Mirrored", code: "MIR", adder: 120 },
    ];
    door.exclude = [{ configuration: "POCKET", style: "MIR" }];
    const v = buildVariants(door).variants;
    expect(v.find((x) => x.sku === "PINE-SGL-KNT-MIR")!.price).toBe(565);
    expect(v.find((x) => x.sku === "PINE-POCKET-KNT-MIR")).toBeUndefined();
    expect(v).toHaveLength(5 * 2 - 1);
  });
});

describe("Shopify mapping", () => {
  it("builds a productSet input", async () => {
    const p = await parseProductFile("catalog/_templates/tile.yaml");
    const input = toProductSetInput(p, store);
    expect(input).toMatchObject({ handle: p.handle, vendor: "Test Co", productType: "Tile", status: "DRAFT" });
    expect(input.productOptions).toEqual([
      { name: "Size", values: [{ name: "8x48" }, { name: "6x36" }] },
      { name: "Finish", values: [{ name: "Matte" }, { name: "Textured" }] },
    ]);
    // 2.89/sqft * 15.5 sqft per box
    expect(input.variants[0]).toMatchObject({ price: "44.80", inventoryItem: { sku: "TIL-WL-848-MAT", tracked: true } });
  });

  it("reuses variant ids and skips unchanged images on re-sync", async () => {
    const p = await parseProductFile("catalog/_templates/flooring.yaml");
    const input = toProductSetInput(p, store, {
      id: "gid://shopify/Product/1",
      variantIdsBySku: new Map([["FLR-WO-NAT", "gid://shopify/ProductVariant/9"]]),
      syncedImageSources: [],
    });
    expect(input).toMatchObject({ id: "gid://shopify/Product/1" });
    expect(input.variants[0]).toMatchObject({ id: "gid://shopify/ProductVariant/9" });
    expect(input.variants[1]).not.toHaveProperty("id");
    expect(input).not.toHaveProperty("files");
  });

  it("escapes description HTML", async () => {
    const p = await parseProductFile("catalog/_templates/tile.yaml");
    p.description = "A & B <script>\n\nSecond";
    expect(descriptionHtml(p)).toBe("<p>A &amp; B &lt;script&gt;</p>\n<p>Second</p>");
  });

  it("syncs through a client: lookup then productSet", async () => {
    const p = await parseProductFile("catalog/products/doors/solid-pine-interior-door.yaml");
    const calls: { query: string; vars: any }[] = [];
    const client = {
      async graphql(query: string, vars: any) {
        calls.push({ query, vars });
        if (query.includes("FindProduct")) return { products: { nodes: [] } };
        return {
          productSet: {
            product: { id: "gid://shopify/Product/5", variantsCount: { count: vars.input.variants.length } },
            userErrors: [],
          },
        };
      },
    } as unknown as ShopifyClient;
    const r = await syncProduct(client, p, store);
    expect(r).toEqual({ handle: p.handle, action: "created", id: "gid://shopify/Product/5", variants: 70 });
    expect(calls[0]!.vars.query).toBe(`handle:${p.handle}`);
    expect(calls[1]!.vars.input.variants[0]).toMatchObject({ inventoryPolicy: "CONTINUE" });
  });
});
