# Doors catalog

The product catalog for our direct-to-consumer door business (with room for flooring
and tile), stored as YAML in this repo and pushed to Shopify through the Admin GraphQL API.

The YAML files are the source of truth. Edit a file, run `npm run sync -- --apply`, and
Shopify's products, variants, prices, specs and images are created or updated to match.

## Quick start

```bash
npm install
npm run validate          # check every catalog file
npm run list              # see every variant, SKU and price
npm run sync              # dry run: writes the Shopify payloads to out/, sends nothing
cp .env.example .env      # add store domain + credentials
npm run sync -- --apply   # push to Shopify
npm run sync -- --apply --only solid-pine-interior-door
npm test
```

## Layout

```
catalog/
  store.yaml                 vendor name, metafield namespace
  products/doors/*.yaml      live products (one file per product)
  _templates/                flooring.yaml, tile.yaml: copy these to start a new line
src/
  schema.ts                  what a valid product file looks like (door / flooring / tile)
  variants.ts                turns a product into Shopify variants with prices and SKUs
  shopify/mapProduct.ts      product → Shopify ProductSetInput (no network)
  shopify/sync.ts            find by handle, then productSet (create or update)
  shopify/client.ts          GraphQL client with auth and retry on rate limits
```

## Product types

**Doors** are made to order. You list the configurations (Single, French Pair, Bifold,
Barn, Pocket) with a base price, wood grades and styles with price adders, and every
combination becomes a Shopify variant:

`price = configuration basePrice + grade adder + style adder`, SKU `PINE-SGL-CLR-SHK`.

Use `exclude` for combinations you don't build. Door variants never sell out
(`inventoryPolicy: CONTINUE`, not tracked). The exact opening size isn't a variant;
see "Still to do".

**Flooring and tile** are sold by the box. Each variant lists `pricePerSqFt` and
`sqFtPerBox`; the box price is calculated, and both numbers are saved as variant
metafields so the theme can show "$/sq ft" and a coverage calculator. Inventory is tracked.

To add another line (trim, hardware, ...), add a schema in `src/schema.ts` and a builder in
`src/variants.ts`.

## What gets written to Shopify

- Title, description (paragraphs + highlights list), vendor, product type, status, tags, SEO
- Options and variants with price, SKU, inventory policy
- `specs` → product metafields in the `catalog` namespace (e.g. `catalog.species`)
- Images from public URLs (only re-uploaded when the image list changes)

Re-syncing matches variants by SKU, so variant IDs stay stable. **Don't rename SKU codes
on live products**: a renamed SKU is a new variant, and the old one is deleted.
Variants removed from the YAML are deleted in Shopify. Edits made directly in Shopify
to synced fields are overwritten on the next sync.

## Shopify setup

1. Create an app for your store with the Admin API scopes `read_products`, `write_products`
   (add `write_files` if you add images).
2. Put credentials in `.env`: either `SHOPIFY_ADMIN_TOKEN` (an `shpat_...` token), or
   `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` for an app from the Shopify Dev Dashboard
   installed on your own store. Never commit `.env`.
3. Optional: in Shopify admin, add metafield definitions for the `catalog.*` keys so they
   show up nicely in the admin and can be used in the theme editor.
4. Use automated collections by product type or tag (e.g. product type = Doors).

API version defaults to `2025-10` (`SHOPIFY_API_VERSION` to change it).

## Still to do

- **Confirm prices.** Bifold, barn and pocket door prices, knotty-pine and style adders are
  placeholders (marked `TODO` in the door file). The door stays `status: draft` until then.
- **Opening size at checkout.** Add width/height fields on the product page (line item
  properties in the theme, or a product-options app) so each order carries its size.
  Decide whether oversized openings cost more.
- **Photos** for the door file.
- Lead time (`madeToOrder.leadTimeWeeks`).
- Not yet tested against a live store: run the dry run, then `--apply --only <handle>` on a
  development store first.
