import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCatalog } from "./load.js";
import { buildVariants, checkVariants } from "./variants.js";
import { toProductSetInput } from "./shopify/mapProduct.js";
import { ShopifyClient, configFromEnv } from "./shopify/client.js";
import { syncProduct } from "./shopify/sync.js";

const USAGE = `Usage:
  npm run validate                 check every catalog file
  npm run list                     print products, variants and prices
  npm run sync                     dry run: write Shopify payloads to out/
  npm run sync -- --apply          push to Shopify (needs .env)
  npm run sync -- --apply --only <handle>`;

async function main() {
  try {
    process.loadEnvFile(); // reads .env if present
  } catch {}
  const [cmd, ...args] = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;

  const { store, products, errors } = await loadCatalog();
  for (const { file, product } of products) {
    for (const problem of checkVariants(product, buildVariants(product))) errors.push(`${file}: ${problem}`);
  }
  if (errors.length) {
    console.error(`Catalog has ${errors.length} problem(s):\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  const selected = products.filter((p) => !only || p.product.handle === only);
  if (only && selected.length === 0) throw new Error(`No product with handle "${only}"`);

  switch (cmd) {
    case "validate":
      console.log(`OK: ${products.length} product(s) valid.`);
      break;

    case "list":
      for (const { product } of selected) {
        const { variants } = buildVariants(product);
        const prices = variants.map((v) => v.price);
        console.log(
          `\n${product.title}  [${product.type}, ${product.status}]  ${product.handle}\n` +
            `  ${variants.length} variants, $${Math.min(...prices)} – $${Math.max(...prices)}`,
        );
        for (const v of variants) {
          console.log(`  ${v.sku.padEnd(24)} $${v.price.toFixed(2).padStart(9)}  ${v.options.map(([, x]) => x).join(" / ")}`);
        }
      }
      break;

    case "sync": {
      if (!args.includes("--apply")) {
        await mkdir("out", { recursive: true });
        for (const { product } of selected) {
          const file = path.join("out", `${product.handle}.productSet.json`);
          await writeFile(file, JSON.stringify(toProductSetInput(product, store), null, 2));
          console.log(`dry run: wrote ${file}`);
        }
        console.log("Nothing was sent to Shopify. Re-run with --apply to push.");
        break;
      }
      const client = new ShopifyClient(configFromEnv());
      let failed = 0;
      for (const { product } of selected) {
        try {
          const r = await syncProduct(client, product, store);
          console.log(`${r.action}: ${r.handle} (${r.variants} variants) ${r.id}`);
        } catch (e) {
          failed++;
          console.error(`FAILED: ${(e as Error).message}`);
        }
      }
      if (failed) process.exit(1);
      break;
    }

    default:
      console.log(USAGE);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
