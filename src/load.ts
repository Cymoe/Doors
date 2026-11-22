import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { addonsFile, product, storeConfig, type AddonGroup, type Product, type StoreConfig } from "./schema";

export interface LoadedProduct {
  file: string;
  product: Product;
}

export interface LoadResult {
  store: StoreConfig;
  products: LoadedProduct[];
  addons: AddonGroup[];
  errors: string[];
}

async function* yamlFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    // Folders and files starting with "_" are templates/notes, not live products.
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* yamlFiles(full);
    else if (/\.ya?ml$/.test(entry.name)) yield full;
  }
}

export async function parseProductFile(file: string): Promise<Product> {
  return product.parse(parse(await readFile(file, "utf8")));
}

export async function loadCatalog(root = "catalog"): Promise<LoadResult> {
  const store = storeConfig.parse(parse(await readFile(path.join(root, "store.yaml"), "utf8")));
  const products: LoadedProduct[] = [];
  const errors: string[] = [];
  const handles = new Map<string, string>();

  for await (const file of yamlFiles(path.join(root, "products"))) {
    const result = product.safeParse(parse(await readFile(file, "utf8")));
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    const prior = handles.get(result.data.handle);
    if (prior) errors.push(`${file}: handle "${result.data.handle}" already used by ${prior}`);
    handles.set(result.data.handle, file);
    products.push({ file, product: result.data });
  }

  const addons = await loadAddons(root, products.map((p) => p.product), errors);
  return { store, products, addons, errors };
}

/** Reads catalog/addons.yaml (optional) and checks each add-on points at a real product and options. */
async function loadAddons(root: string, products: Product[], errors: string[]): Promise<AddonGroup[]> {
  const file = path.join(root, "addons.yaml");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }
  const result = addonsFile.safeParse(parse(raw));
  if (!result.success) {
    for (const issue of result.error.issues) errors.push(`${file}: ${issue.path.join(".")}: ${issue.message}`);
    return [];
  }
  const doors = products.filter((p) => p.type === "door");
  for (const [i, a] of result.data.addons.entries()) {
    for (const which of ["single", "double"] as const) {
      const src = a[which];
      if (!src) continue;
      const p = products.find((x) => x.handle === src.product);
      if (!p || p.type !== "standard") {
        errors.push(`${file}: addons.${i}.${which}: no catalog product "${src.product}"`);
        continue;
      }
      const ok = p.variants.some((v) => Object.entries(src.options).every(([k, val]) => v.options[k] === val));
      if (!ok) errors.push(`${file}: addons.${i}.${which}: no variant of "${src.product}" has options ${JSON.stringify(src.options)}`);
    }
    for (const code of a.customConfigurations) {
      if (!doors.some((d) => d.type === "door" && d.configurations.some((c) => c.code === code))) {
        errors.push(`${file}: addons.${i}: no custom door configuration "${code}"`);
      }
    }
  }
  return result.data.addons;
}
