"use client";

import { useState } from "react";
import type { AddonOffer } from "@/cart";
import type { StandardProduct } from "@/schema";
import { usd } from "@/pricing";
import { AddToCart, AddonsStep, Gallery, resolveAddons, type AddonState } from "./steps";
import { Description } from "./Description";

interface Props {
  product: StandardProduct;
  addons: AddonOffer[];
  shippingNote?: string;
}

type Variant = StandardProduct["variants"][number];

const matches = (v: Variant, picks: Record<string, string>) =>
  Object.entries(picks).every(([name, value]) => v.options[name] === value);

/**
 * A catalog product: every option on one screen (like a size chart), with a
 * size already picked so the price shows right away. Values that don't exist
 * with the other picks are crossed out; choosing one moves the other picks to
 * the closest combination that does exist.
 */
export function ProductBuilder({ product, addons, shippingNote }: Props) {
  const names = product.optionNames;
  const firstAvailable = product.variants.find((v) => v.available) ?? product.variants[0]!;
  const [picks, setPicks] = useState<Record<string, string>>(() => ({ ...firstAvailable.options }));
  const [addonState, setAddonState] = useState<AddonState>({});
  const [quantity, setQuantity] = useState(1);

  const variant = product.variants.find((v) => matches(v, picks));
  const resolved = resolveAddons(addons, addonState);

  /** Values of an option, in catalog order, with whether they work with the other current picks. */
  function valuesFor(name: string) {
    const others = Object.fromEntries(Object.entries(picks).filter(([n]) => n !== name));
    const seen = new Map<string, { possible: boolean; price?: number }>();
    for (const v of product.variants) {
      const val = v.options[name]!;
      const entry = seen.get(val) ?? { possible: false };
      if (v.available && matches(v, others)) {
        entry.possible = true;
        entry.price = Math.min(entry.price ?? Infinity, v.price);
      }
      seen.set(val, entry);
    }
    return [...seen.entries()];
  }

  function pick(name: string, value: string) {
    const next = { ...picks, [name]: value };
    if (!product.variants.some((v) => v.available && matches(v, next))) {
      // Keep as many of the other picks as possible: the in-stock variant with this value that matches the most.
      const pool = product.variants.filter((v) => v.available && v.options[name] === value);
      const best = pool.sort((a, b) => score(b) - score(a))[0];
      if (best) Object.assign(next, best.options);
    }
    setPicks(next);
    function score(v: Variant) {
      return names.filter((n) => v.options[n] === picks[n]).length;
    }
  }

  const priceDiffers = (name: string) => {
    const prices = new Set(valuesFor(name).filter(([, x]) => x.possible).map(([, x]) => x.price));
    return prices.size > 1;
  };

  return (
    <div className="builder">
      <div className="preview full">
        <Gallery images={product.images} title={product.title} />
      </div>

      <div>
        <h1 className="product-title">{product.title}</h1>
        <p className="product-price">
          {variant ? usd(variant.price) : "Not available"}
          {variant?.compareAtPrice && <s className="was">{usd(variant.compareAtPrice)}</s>}
          {variant?.compareAtPrice && (
            <span className="save">Save {usd(variant.compareAtPrice - variant.price)}</span>
          )}
        </p>

        {names.map((name) => {
          const showPrices = priceDiffers(name);
          return (
            <fieldset key={name} className="opt-group">
              <legend>
                {name}: <span className="opt-current">{picks[name]}</span>
              </legend>
              <div className="sizes">
                {valuesFor(name).map(([value, x]) => (
                  <button key={value} type="button" className="size" aria-pressed={picks[name] === value}
                    data-unavailable={!x.possible || undefined} onClick={() => pick(name, value)}
                    aria-label={x.possible ? value : `${value} (not available with your other choices)`}>
                    <span>{value}</span>
                    {showPrices && x.possible && <span className="size-price">{usd(x.price!)}</span>}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}

        {addons.length > 0 && (
          <fieldset className="opt-group">
            <legend>Add-ons <span className="opt-current">(optional)</span></legend>
            <AddonsStep offers={addons} state={addonState} onChange={setAddonState} />
          </fieldset>
        )}

        {variant ? (
          resolved.complete ? (
            <AddToCart
              lines={[{ label: names.length ? names.map((n) => picks[n]).join(" · ") : product.title, amount: variant.price }]}
              addons={resolved.chosen}
              quantity={quantity}
              onQuantity={setQuantity}
              unit={["", ""]}
              shippingNote={shippingNote}
              item={{ handle: product.handle, sku: variant.sku, addons: resolved.chosen.map((a) => ({ key: a.key, sku: a.sku })) }}
            />
          ) : (
            <p className="notice">Finish choosing your add-on options, or untick the add-on.</p>
          )
        ) : (
          <p className="notice">That combination isn&apos;t available. Choose a different option.</p>
        )}

        <details className="about" open>
          <summary>Details</summary>
          <Description text={product.description} />
        </details>
      </div>
    </div>
  );
}
