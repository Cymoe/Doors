# Door to Door Co

The Door to Door Co store: a photo catalog of every door, hardware and flooring product,
a custom door builder with live pricing, Stripe checkout and quote requests. The catalog
lives as YAML files in this repo, with photos in `public/images/`.

No Shopify at runtime: the site, the pricing and the checkout flow are ours to change.
The catalog was imported from the Shopify store once (see "Importing from Shopify").

## Quick start

```bash
npm install
npm run dev               # http://localhost:3000 (drafts are shown in dev)
npm test                  # pricing, catalog and checkout tests
npm run list              # every door combination and its standard-size price
```

Without keys the site works, but checkout says it isn't set up yet, and quote
requests are printed to the terminal in dev. To turn them on:

```bash
cp .env.example .env.local   # then fill in the keys
```

| Variable | What it's for |
|---|---|
| `STRIPE_SECRET_KEY` | Checkout. Use the `sk_test_...` key until you're ready; test cards like 4242 4242 4242 4242 work. |
| `STRIPE_AUTOMATIC_TAX` | `true` to charge Texas sales tax with Stripe Tax (set it up in the Stripe dashboard first). |
| `SITE_URL` | The public site address, for Stripe's return links. |
| `RESEND_API_KEY`, `RESEND_FROM` | Emails quote requests to `contact.email` in `catalog/store.yaml`. |
| `SHOW_DRAFTS` | `true` to show draft products on a deployed preview site. |

## How it works

- **Catalog** (`/`, `/c/<category>`): a grid of product photos with "From" prices and sale badges.
- **Product pages** (`/products/<handle>`): pick each option one step at a time (size, handing, finish...),
  then optional add-ons, then review and **Add to cart**.
- **Custom door builder** (`/products/solid-pine-interior-door`): door type, style, wood (all with photos),
  the opening size (`32`, `32.5` and `32 1/2` all work), add-ons, then add to cart.
- **Add-ons** (`catalog/addons.yaml`): jamb kit and knob bore, offered on interior and French doors
  and on the custom single and French pair. A pair automatically gets the double-door version.
- **Cart** (`/cart`): kept in the customer's browser. It holds choices only; `/api/cart` prices it.
- **Checkout**: Stripe Checkout, paid in full. Each cart line is a Stripe line item whose description
  carries the options, opening size, add-ons and SKU. Shipping is added as a fixed rate.
  Stripe emails the receipt; turn on "Successful payments" emails in Stripe to hear about each order.
- **Shipping** (`shipping` in `catalog/store.yaml`): a freight fee by order subtotal, free over
  `freeOver`, and a parcel fee for hardware-only orders. US addresses only; the cart says Alaska and
  Hawaii need a quote.
- **Pricing**: every price is worked out on the server from the catalog (`src/cart.ts`), never taken from the
  browser. Custom doors: `base price + doors × (wood + style + oversize)`.
- **Sizes** are opening sizes per door; a French pair or bifold splits the width between its two doors.
  Up to `standard` is the listed price. Up to `oversize` adds a set amount per door. Anything else
  goes to "request a quote".
- **Quote requests** are emailed to you with the customer's selection already filled in.

## Editing the catalog

Everything a non-developer should need to change is in `catalog/`:

```
catalog/
  store.yaml                     business name, logo, contact, shipping rates
  addons.yaml                    which add-ons are offered on which doors
  products/doors/*.yaml          the custom door: prices, styles, size rules, photos per option
  products/<category>/*.yaml     catalog products (imported from Shopify): options, variants, prices
  products/addons/*.yaml         add-on products (jamb kits, bore); not listed on their own
  _templates/flooring.yaml       copy into products/flooring/ to start selling flooring
  _templates/tile.yaml           same for tile
```

Products only appear on the live site when `status: active`. Run `npm run validate` after editing;
the build fails on a bad file rather than publishing it.

## Importing from Shopify

```bash
npm run import:shopify                     # re-import from www.doortodoorco.com
```

Reads the store's public product feed, sorts products into categories, skips internal items
(fees, hidden options, tests), anything primed, and products without photos, imports the add-on products as unlisted, and saves
up to 4 photos per product as JPEGs. Imported files start with an "Imported from Shopify" line;
delete that line from a file you've edited and future imports leave it alone.

## Code

```
src/
  schema.ts                  what a valid catalog file looks like
  pricing.ts                 door prices, sizes, shipping fee, inch parsing
  cart.ts, cart-schema.ts    cart format, add-ons per product, pricing a cart
  import-shopify.ts          one-off importer from a Shopify store
  variants.ts                every combination with SKU and price (used by `npm run list`)
  catalog.ts                 the catalog as the site sees it
  app/                       pages and API routes (Next.js)
    page.tsx, c/[category]/  catalog grid
    products/[handle]/       product page (custom door builder or step-by-step options)
    cart/                    cart page
    api/cart/                prices a cart
    api/checkout/            creates the Stripe Checkout session from the cart
    api/quote/               emails a quote request
    order/success/           order confirmation (empties the cart)
    measure/                 how-to-measure guide
  components/                CatalogGrid, DoorBuilder, ProductBuilder, CartView, cart-store, steps (shared step UI), QuoteForm
```

## Deploying

Any Next.js host works; Vercel is the simplest: import the repo, add the environment variables
above, and set `SITE_URL` to the real domain.

## Still to do

- **Shipping rates**: the freight tiers ($175 / $150 / $100) and $15 parcel fee are estimates.
  Put your real rates in `catalog/store.yaml`.
- Review the custom door's estimated prices (only Single $495 and French Pair $995 came from the
  listing) and the $100 oversize charge.
- Alaska and Hawaii: Stripe can only limit checkout to the US, so the cart asks those customers to
  contact you. Watch for those orders until address checks are added.
- Lead time for the custom door (`leadTimeWeeks`).
- Turn on Stripe Tax if you need to collect sales tax (`STRIPE_AUTOMATIC_TAX=true`).
