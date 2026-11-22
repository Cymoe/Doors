# Doors

Website for our made-to-order door business: a door builder with live pricing,
Stripe checkout with a deposit, and quote requests. The product catalog (doors now,
flooring and tile later) lives as YAML files in this repo.

No Shopify: the site, the pricing and the checkout flow are ours to change.

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

- **Door builder** (`/doors/<handle>`): the customer picks the door type, style and wood, and enters the
  opening size (`32`, `32.5` and `32 1/2` all work). The drawing and the price update as they go.
- **Pricing** (`src/pricing.ts`): `base price + doors × (wood + style + oversize)`. The checkout API
  recomputes the price on the server, so a price sent from the browser is never trusted.
- **Sizes** are opening sizes per door; a French pair or bifold splits the width between its two doors.
  Up to `standard` is the listed price. Up to `oversize` adds a set amount per door. Anything else
  goes to "request a quote".
- **Checkout**: Stripe Checkout charges `depositPercent` of the total (doors + delivery). The order
  details are stored on the payment in the Stripe dashboard: door, SKU, opening size, quantity,
  pickup/delivery, total and balance due. Stripe emails the receipt. Turn on "Successful payments"
  emails in your Stripe notification settings to hear about each order.
- **Quote requests** are emailed to you with the customer's selection already filled in.

## Editing the catalog

Everything a non-developer should need to change is in `catalog/`:

```
catalog/
  store.yaml                     business name, contact, deposit %, pickup, delivery fee
  products/doors/*.yaml          one file per product: prices, styles, size rules, specs
  _templates/flooring.yaml       copy into products/flooring/ to start selling flooring
  _templates/tile.yaml           same for tile
```

Products only appear on the live site when `status: active`. Run `npm run validate` after editing;
the build fails on a bad file rather than publishing it.

## Code

```
src/
  schema.ts                  what a valid catalog file looks like
  pricing.ts                 door prices, sizes, deposit/balance, inch parsing
  variants.ts                every combination with SKU and price (used by `npm run list`)
  catalog.ts                 the catalog as the site sees it
  app/                       pages and API routes (Next.js)
    doors/[handle]/          door builder page
    api/checkout/            creates the Stripe Checkout session
    api/quote/               emails a quote request
    order/success|cancelled  after checkout
    measure/                 how-to-measure guide
  components/                DoorBuilder, DoorPreview (the drawing), QuoteForm
```

## Deploying

Any Next.js host works; Vercel is the simplest: import the repo, add the environment variables
above, and set `SITE_URL` to the real domain.

## Still to do

- Business name, email and phone in `catalog/store.yaml`.
- Review the estimated prices (only Single $495 and French Pair $995 came from the listing),
  the $100 oversize charge, the $75 delivery fee and the 50% deposit.
- Photos of real doors, and lead time (`leadTimeWeeks`).
- Switch the door to `status: active` when it's ready.
- Flooring and tile pages: the catalog supports them; the site doesn't show them yet.
- Talk to your accountant about sales tax on deposits before turning on Stripe Tax.
