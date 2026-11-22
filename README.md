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
  then quantity, pickup or delivery, review and pay. Catalog products are paid in full.
- **Custom door builder** (`/products/solid-pine-interior-door`): the customer picks the door type, style and wood, and enters the
  opening size (`32`, `32.5` and `32 1/2` all work). The drawing and the price update as they go.
- **Pricing** (`src/pricing.ts`): `base price + doors × (wood + style + oversize)`. The checkout API
  recomputes the price on the server, so a price sent from the browser is never trusted.
- **Sizes** are opening sizes per door; a French pair or bifold splits the width between its two doors.
  Up to `standard` is the listed price. Up to `oversize` adds a set amount per door. Anything else
  goes to "request a quote".
- **Checkout**: for custom doors, Stripe Checkout charges `depositPercent` of the total (doors + delivery);
  catalog products are charged in full. The order
  details are stored on the payment in the Stripe dashboard: door, SKU, opening size, quantity,
  pickup/delivery, total and balance due. Stripe emails the receipt. Turn on "Successful payments"
  emails in your Stripe notification settings to hear about each order.
- **Quote requests** are emailed to you with the customer's selection already filled in.

## Editing the catalog

Everything a non-developer should need to change is in `catalog/`:

```
catalog/
  store.yaml                     business name, logo, contact, deposit %, pickup, delivery fee
  products/doors/*.yaml          the custom door: prices, styles, size rules, photos per option
  products/<category>/*.yaml     catalog products (imported from Shopify): options, variants, prices
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
(fees, add-on options, jamb kits sold as add-ons, tests) and products without photos, and saves
up to 4 photos per product as JPEGs. Imported files start with an "Imported from Shopify" line;
delete that line from a file you've edited and future imports leave it alone.

## Code

```
src/
  schema.ts                  what a valid catalog file looks like
  pricing.ts                 door prices, sizes, deposit/balance, inch parsing
  import-shopify.ts          one-off importer from a Shopify store
  variants.ts                every combination with SKU and price (used by `npm run list`)
  catalog.ts                 the catalog as the site sees it
  app/                       pages and API routes (Next.js)
    page.tsx, c/[category]/  catalog grid
    products/[handle]/       product page (custom door builder or step-by-step options)
    api/checkout/            creates the Stripe Checkout session
    api/quote/               emails a quote request
    order/success|cancelled  after checkout
    measure/                 how-to-measure guide
  components/                CatalogGrid, DoorBuilder, ProductBuilder, steps (shared step UI), QuoteForm
```

## Deploying

Any Next.js host works; Vercel is the simplest: import the repo, add the environment variables
above, and set `SITE_URL` to the real domain.

## Still to do

- Confirm pickup/delivery: the site says Midland, TX, but the phone number is a (770) number.
- A cart, so customers can buy a door and its hardware in one checkout.
- Review the estimated prices (only Single $495 and French Pair $995 came from the listing),
  the $100 oversize charge, the $75 delivery fee and the 50% deposit.
- Lead time for the custom door (`leadTimeWeeks`).
- Jamb kits, bore holes and other add-ons that Shopify attached to doors aren't offered yet.
- Talk to your accountant about sales tax on deposits before turning on Stripe Tax.
