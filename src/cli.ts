import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCatalog } from "./load";
import { buildVariants, checkVariants } from "./variants";

const USAGE = `Usage:
  npm run validate     check every catalog file
  npm run list         print products, variants and prices
  npm run catalog      check the catalog and write src/generated/catalog.json for the site`;

async function main() {
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
            `  ${variants.length} variants, $${Math.min(...prices)} – $${Math.max(...prices)} (standard size)`,
        );
        for (const v of variants) {
          console.log(`  ${v.sku.padEnd(24)} $${v.price.toFixed(2).padStart(9)}  ${v.options.map(([, x]) => x).join(" / ")}`);
        }
      }
      break;

    case "export": {
      const out = path.join("src", "generated", "catalog.json");
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, JSON.stringify({ store, products: products.map((p) => p.product) }, null, 2) + "\n");
      console.log(`catalog: ${products.length} product(s) → ${out}`);
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
