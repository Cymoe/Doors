/**
 * Imports products from a Shopify store's public product feed into the YAML
 * catalog, and saves their photos under public/images/products/.
 *
 *   npm run import:shopify                      # from www.doortodoorco.com
 *   npm run import:shopify -- --store example.com
 *
 * Files it writes start with IMPORT_MARKER. A file you've edited by hand
 * and removed that line from is left alone on the next import.
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { stringify } from "yaml";
import { product as productSchema, type Category } from "./schema";

const IMPORT_MARKER = "# Imported from Shopify. Delete this line to stop future imports from overwriting this file.";
const MAX_IMAGES = 4;
const IMAGE_WIDTH = 700;

interface ShopifyProduct {
  handle: string;
  title: string;
  body_html: string | null;
  product_type: string;
  tags: string[] | string;
  options: { name: string; position: number; values: string[] }[];
  variants: {
    id: number;
    sku: string | null;
    price: string;
    compare_at_price: string | null;
    available?: boolean;
    option1: string | null;
    option2: string | null;
    option3: string | null;
  }[];
  images: { src: string; alt?: string | null }[];
}

/**
 * Hidden Shopify products that are offered as add-ons on door pages (see
 * catalog/addons.yaml). Imported unlisted, into catalog/products/addons/.
 */
export const ADDON_HANDLES = new Set([
  "jamb-kit-single-door",
  "jamb-kit-double-door",
  "slab-door-bore-hole-single-2-3-8-backset",
]);

const HIDDEN_TYPES = new Set(["OPTIONS_HIDDEN_PRODUCT", "mw_product_option", "mws_fee_generated", "Gift Card"]);
const HIDDEN_HANDLES = /^(test|bold-test|custom-item|add-ons|adders|processing-fee|shipping-handling-fee|expedited-fee|hinge|hinge-finishes|primed|pre-hanging|door-configuration|keying-option|custom-options-for-)/;

/** We don't sell primed doors or parts: skip primed products, and primed choices within a product. */
export const isPrimed = (s: string) => /primed/i.test(s);

/** Which section of the store a product belongs in, from its type and handle. Undefined = don't import. */
export function categorize(p: Pick<ShopifyProduct, "handle" | "product_type">): Category | undefined {
  const h = p.handle;
  const t = p.product_type;
  if (HIDDEN_TYPES.has(t) || HIDDEN_HANDLES.test(h)) return undefined;
  if (/jamb-kit|casing|brickmold|bore-hole|ball-catch$/.test(h)) return undefined; // sold as add-ons
  if (h.includes("flooring")) return "flooring";
  if (t === "Hardware" || t === "Barn Door Hardware" || t === "Pocket Doors" || /hardware|pocket-door|dressing-board/.test(h)) {
    return "hardware";
  }
  if (h.startsWith("prehung")) return "prehung";
  if (/exterior|sidelite/.test(h) || t === "Fir") return "exterior";
  if (h.includes("barn")) return "barn";
  if (/bifold|bypass/.test(h)) return "bifold";
  if (/french|lite/.test(h)) return "french";
  return "interior";
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", deg: "°", frac12: "½", frac14: "¼", frac34: "¾", times: "×", hellip: "…", reg: "®", trade: "™",
};

/** Shopify descriptions are HTML; the catalog stores plain-text paragraphs. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|table)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n• *\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const cleanOptionName = (n: string) => n.replace(/^select\s+/i, "").replace(/\s+/g, " ").trim();
const money = (s: string | null) => (s === null || s === "" ? undefined : Math.round(Number(s) * 100) / 100);

export function toCatalogProduct(p: ShopifyProduct, category: Category, images: { src: string; alt: string }[]) {
  const singleVariant = p.options.length === 1 && p.options[0]!.name === "Title" && p.variants.length === 1;
  const optionNames = singleVariant ? [] : p.options.map((o) => cleanOptionName(o.name));
  const seen = new Set<string>();
  const variants = p.variants
    .filter((v) => ![v.option1, v.option2, v.option3].some((o) => o && isPrimed(o)))
    .map((v) => {
    let sku = (v.sku ?? "").trim();
    if (!sku || seen.has(sku)) sku = `DTD-${v.id}`;
    seen.add(sku);
    const values = [v.option1, v.option2, v.option3];
    const price = money(v.price)!;
    const compareAt = money(v.compare_at_price);
    return {
      sku,
      options: Object.fromEntries(optionNames.map((n, i) => [n, values[i] ?? ""])),
      price,
      ...(compareAt && compareAt > price ? { compareAtPrice: compareAt } : {}),
      ...(v.available === false ? { available: false } : {}),
    };
  });
  const tags = (Array.isArray(p.tags) ? p.tags : p.tags.split(","))
    .map((t) => t.trim())
    // Drop Shopify theme/app bookkeeping tags (tab_*, YGroup_*, ship*, ...).
    .filter((t) => t && !/^(_|mw_|bold|hidden|tab_|ygroup|ship|prehung-bundle)/i.test(t));

  return {
    type: "standard" as const,
    handle: p.handle,
    title: p.title.trim(),
    status: "active" as const,
    category,
    description: htmlToText(p.body_html ?? "") || p.title,
    tags,
    images,
    optionNames,
    variants,
  };
}

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function saveImage(src: string, file: string): Promise<boolean> {
  if (await exists(file)) return true;
  const url = new URL(src.startsWith("//") ? `https:${src}` : src);
  url.searchParams.set("width", String(IMAGE_WIDTH));
  const res = await fetch(url);
  if (!res.ok) return false;
  const input = Buffer.from(await res.arrayBuffer());
  await sharp(input)
    .flatten({ background: "#ffffff" }) // transparent PNGs onto white
    .resize({ width: IMAGE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toFile(file);
  return true;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) await fn(items[i++]!);
    }),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const store = args.includes("--store") ? args[args.indexOf("--store") + 1]! : "www.doortodoorco.com";

  const all: ShopifyProduct[] = [];
  for (let page = 1; page < 20; page++) {
    const res = await fetch(`https://${store}/products.json?limit=250&page=${page}`);
    if (!res.ok) throw new Error(`products.json page ${page}: ${res.status}`);
    const { products } = (await res.json()) as { products: ShopifyProduct[] };
    if (!products.length) break;
    all.push(...products);
  }
  console.log(`${all.length} products in the store`);

  let written = 0, skippedPrimed = 0, skippedHidden = 0, skippedNoPhoto = 0, keptEdited = 0;
  const problems: string[] = [];
  await pool(all, 6, async (p) => {
    if (isPrimed(p.handle) || isPrimed(p.title)) return void skippedPrimed++;
    const addon = ADDON_HANDLES.has(p.handle);
    const category = addon ? "hardware" : categorize(p);
    if (!category) return void skippedHidden++;
    if (!p.images.length && !addon) return void skippedNoPhoto++;

    const file = path.join("catalog", "products", addon ? "addons" : category, `${p.handle}.yaml`);
    if ((await exists(file)) && !(await readFile(file, "utf8")).startsWith(IMPORT_MARKER)) return void keptEdited++;

    const dir = path.join("public", "images", "products", p.handle);
    await mkdir(dir, { recursive: true });
    const images: { src: string; alt: string }[] = [];
    for (const [i, img] of p.images.slice(0, MAX_IMAGES).entries()) {
      const name = `${i + 1}.jpg`;
      if (await saveImage(img.src, path.join(dir, name))) {
        images.push({ src: `/images/products/${p.handle}/${name}`, alt: (img.alt ?? "").trim() || p.title });
      }
    }
    const item = { ...toCatalogProduct(p, category, images), ...(addon ? { listed: false } : {}) };
    const check = productSchema.safeParse(item);
    if (!check.success) {
      problems.push(`${p.handle}: ${check.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
      return;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${IMPORT_MARKER}\n# Source: https://${store}/products/${p.handle}\n${stringify(item, { lineWidth: 0 })}`);
    written++;
  });

  console.log(
    `wrote ${written}; skipped ${skippedPrimed} primed, ${skippedHidden} internal/add-on items, ${skippedNoPhoto} without photos, ` +
      `${keptEdited} hand-edited files`,
  );
  if (problems.length) {
    console.error(`${problems.length} product(s) not imported:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("import-shopify.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
