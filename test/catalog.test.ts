import { describe, expect, it } from "vitest";
import { loadCatalog, parseProductFile } from "../src/load";
import { buildVariants, checkVariants } from "../src/variants";
import type { DoorProduct } from "../src/schema";

const DOOR = "catalog/products/doors/solid-pine-interior-door.yaml";

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

describe("door variants (standard size)", () => {
  it("prices singles from $495 and French pairs from $995", async () => {
    const door = (await parseProductFile(DOOR)) as DoorProduct;
    const v = buildVariants(door).variants;
    const min = (cfg: string) => Math.min(...v.filter((x) => x.options[0]![1] === cfg).map((x) => x.price));
    expect(min("Single")).toBe(495);
    expect(min("French Pair")).toBe(995);
  });

  it("applies adders and exclusions", async () => {
    const door = (await parseProductFile(DOOR)) as DoorProduct;
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

  it("charges grade and style adders per slab", async () => {
    const door = (await parseProductFile(DOOR)) as DoorProduct;
    const price = (sku: string) => buildVariants(door).variants.find((x) => x.sku === sku)!.price;
    expect(price("PINE-SGL-CLR-LOUV")).toBe(495 + 175);
    expect(price("PINE-FRP-CLR-LOUV")).toBe(995 + 2 * 175);
    expect(price("PINE-FRP-KNT-GLS")).toBe(995 + 2 * 150);
  });
});
