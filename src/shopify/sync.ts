import type { Product, StoreConfig } from "../schema.js";
import type { ShopifyClient } from "./client.js";
import { toProductSetInput, type ExistingProduct } from "./mapProduct.js";

const FIND_PRODUCT = /* GraphQL */ `
  query FindProduct($query: String!, $ns: String!, $after: String) {
    products(first: 1, query: $query) {
      nodes {
        id
        handle
        imageSources: metafield(namespace: $ns, key: "image_sources") { value }
        variants(first: 250, after: $after) {
          nodes { id sku }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const PRODUCT_SET = /* GraphQL */ `
  mutation ProductSet($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product { id handle status variantsCount { count } }
      userErrors { field message code }
    }
  }
`;

interface FindResult {
  products: {
    nodes: {
      id: string;
      handle: string;
      imageSources: { value: string } | null;
      variants: { nodes: { id: string; sku: string | null }[]; pageInfo: { hasNextPage: boolean; endCursor: string } };
    }[];
  };
}

export async function findExisting(
  client: ShopifyClient,
  handle: string,
  ns: string,
): Promise<ExistingProduct | undefined> {
  const variantIdsBySku = new Map<string, string>();
  let after: string | null = null;
  let found: FindResult["products"]["nodes"][number] | undefined;
  do {
    const data: FindResult = await client.graphql<FindResult>(FIND_PRODUCT, { query: `handle:${handle}`, ns, after });
    // The search is not an exact match, so check the handle ourselves.
    found = data.products.nodes.find((n) => n.handle === handle);
    if (!found) return undefined;
    for (const v of found.variants.nodes) if (v.sku) variantIdsBySku.set(v.sku, v.id);
    after = found.variants.pageInfo.hasNextPage ? found.variants.pageInfo.endCursor : null;
  } while (after);

  let syncedImageSources: string[] | undefined;
  try {
    syncedImageSources = found.imageSources ? JSON.parse(found.imageSources.value) : undefined;
  } catch {
    syncedImageSources = undefined;
  }
  return { id: found.id, variantIdsBySku, syncedImageSources };
}

export interface SyncOutcome {
  handle: string;
  action: "created" | "updated";
  id: string;
  variants: number;
}

export async function syncProduct(client: ShopifyClient, p: Product, store: StoreConfig): Promise<SyncOutcome> {
  const existing = await findExisting(client, p.handle, store.metafieldNamespace);
  const input = toProductSetInput(p, store, existing);
  const data = await client.graphql<{
    productSet: {
      product: { id: string; variantsCount: { count: number } } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(PRODUCT_SET, { input });
  const { product, userErrors } = data.productSet;
  if (userErrors.length || !product) {
    throw new Error(
      `${p.handle}: ${userErrors.map((e) => `${(e.field ?? []).join(".")}: ${e.message}`).join("; ") || "no product returned"}`,
    );
  }
  return {
    handle: p.handle,
    action: existing ? "updated" : "created",
    id: product.id,
    variants: product.variantsCount.count,
  };
}
