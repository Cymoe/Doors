import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { product, storeConfig, type Product, type StoreConfig } from "./schema";

export interface LoadedProduct {
  file: string;
  product: Product;
}

export interface LoadResult {
  store: StoreConfig;
  products: LoadedProduct[];
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
  return { store, products, errors };
}
