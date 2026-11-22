"use client";

import { useMemo, useState } from "react";
import type { StandardProduct, StoreConfig } from "@/schema";
import { orderTotals, usd, type Fulfillment } from "@/pricing";
import {
  DoneRow,
  FulfillmentPicker,
  Gallery,
  OrderSummary,
  Progress,
  QuantityPicker,
  StepNav,
  StepPanel,
  TodoRow,
  defaultFulfillment,
} from "./steps";
import { Description } from "./Description";

interface Props {
  product: StandardProduct;
  store: StoreConfig;
}

type Variant = StandardProduct["variants"][number];

const matches = (v: Variant, picks: Record<string, string>) =>
  Object.entries(picks).every(([name, value]) => v.options[name] === value);

/** A product with set options (size, handing, finish...), chosen one at a time. Paid in full at checkout. */
export function ProductBuilder({ product, store }: Props) {
  const optionSteps = product.optionNames;
  const steps = [...optionSteps, "Quantity & pickup", "Review"];
  const qtyStep = optionSteps.length;
  const reviewStep = qtyStep + 1;

  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [fulfillment, setFulfillment] = useState<Fulfillment>(defaultFulfillment(store));

  const go = (n: number) => {
    setStep(n);
    setFurthest((f) => Math.max(f, n));
  };

  const complete = optionSteps.every((n) => picks[n] !== undefined);
  const variant = complete ? product.variants.find((v) => matches(v, picks)) : undefined;
  const candidates = product.variants.filter((v) => matches(v, picks));
  const minPrice = Math.min(...(candidates.length ? candidates : product.variants).map((v) => v.price));

  /** Choices for option k given the picks before it: value, lowest price, and whether any is in stock. */
  function choicesFor(k: number) {
    const before = Object.fromEntries(optionSteps.slice(0, k).filter((n) => picks[n] !== undefined).map((n) => [n, picks[n]!]));
    const pool = product.variants.filter((v) => matches(v, before));
    const out = new Map<string, { min: number; max: number; available: boolean; compareAt?: number }>();
    for (const v of pool) {
      const val = v.options[optionSteps[k]!]!;
      const c = out.get(val) ?? { min: Infinity, max: 0, available: false };
      c.min = Math.min(c.min, v.price);
      c.max = Math.max(c.max, v.price);
      c.available ||= v.available;
      if (v.compareAtPrice && v.price === c.min) c.compareAt = v.compareAtPrice;
      out.set(val, c);
    }
    return [...out.entries()];
  }

  function pick(k: number, value: string) {
    const name = optionSteps[k]!;
    // Keep later picks only if they still make a real combination.
    const next: Record<string, string> = {};
    for (const n of optionSteps.slice(0, k)) if (picks[n] !== undefined) next[n] = picks[n]!;
    next[name] = value;
    for (const n of optionSteps.slice(k + 1)) {
      if (picks[n] !== undefined && product.variants.some((v) => matches(v, { ...next, [n]: picks[n]! }))) next[n] = picks[n]!;
    }
    setPicks(next);
    // Jump ahead to the first step that still needs an answer.
    const firstMissing = optionSteps.findIndex((n) => next[n] === undefined);
    go(firstMissing === -1 ? Math.max(qtyStep, Math.min(furthest, reviewStep)) : firstMissing);
  }

  const totals = useMemo(
    () => (variant ? orderTotals(variant.price, quantity, fulfillment, { ...store, depositPercent: 100 }) : null),
    [variant, quantity, fulfillment, store],
  );

  let panel = null;
  if (step < qtyStep) {
    const name = optionSteps[step]!;
    const choices = choicesFor(step);
    const allSamePrice = choices.every(([, c]) => c.min === choices[0]![1].min && c.max === c.min);
    panel = (
      <div className="chips">
        {choices.map(([value, c]) => (
          <button key={value} type="button" className="chip" aria-pressed={picks[name] === value}
            disabled={!c.available} onClick={() => pick(step, value)}>
            <span className="chip-title">{value}</span>
            {!c.available ? (
              <span className="chip-detail">Sold out</span>
            ) : !allSamePrice || step === optionSteps.length - 1 ? (
              <span className="chip-detail">
                {c.min === c.max ? usd(c.min) : `from ${usd(c.min)}`}
                {c.compareAt && c.compareAt > c.min && <s className="was"> {usd(c.compareAt)}</s>}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    );
  } else if (step === qtyStep) {
    panel = (
      <>
        <QuantityPicker value={quantity} onChange={setQuantity} unit={["item", "items"]} />
        <FulfillmentPicker store={store} value={fulfillment} onChange={setFulfillment} />
        <StepNav onBack={optionSteps.length ? () => go(qtyStep - 1) : undefined} onNext={() => go(reviewStep)}
          nextDisabled={!variant} nextLabel="Review order" />
      </>
    );
  } else if (variant && totals) {
    panel = (
      <OrderSummary
        lines={[{ label: optionSteps.length ? optionSteps.map((n) => picks[n]).join(" · ") : product.title, amount: variant.price }]}
        quantity={quantity}
        totals={totals}
        depositPercent={100}
        fulfillment={fulfillment}
        checkoutBody={{ handle: product.handle, sku: variant.sku, quantity }}
      />
    );
  } else {
    panel = <p className="notice">That combination isn&apos;t available. Go back and change a choice.</p>;
  }

  const answers = (i: number) =>
    i < qtyStep
      ? picks[optionSteps[i]!] ?? ""
      : `${quantity} · ${fulfillment === "pickup" ? "Pickup" : "Local delivery"}`;

  return (
    <div className="builder">
      <div className="preview full">
        <Gallery images={product.images} title={product.title} />
      </div>

      <div>
        <h1 className="product-title">{product.title}</h1>
        <p className="product-price">
          {variant ? usd(variant.price) : `From ${usd(minPrice)}`}
          {variant?.compareAtPrice && <s className="was">{usd(variant.compareAtPrice)}</s>}
        </p>

        <Progress steps={steps} current={step} furthest={furthest} />

        {steps.map((name, i) => {
          if (i === step) {
            return (
              <StepPanel key={name} index={i} total={steps.length}
                heading={i === reviewStep ? "Review your order" : i === qtyStep ? "Quantity & pickup" : `Choose ${name.toLowerCase()}`}
                onBack={i > 0 && i < qtyStep ? () => go(i - 1) : undefined}>
                {panel}
              </StepPanel>
            );
          }
          if (i <= furthest && i < reviewStep && answers(i)) {
            return <DoneRow key={name} label={name} value={answers(i)} onChange={() => go(i)} />;
          }
          return <TodoRow key={name} label={name} />;
        })}

        <details className="about" open>
          <summary>Details</summary>
          <Description text={product.description} />
        </details>
      </div>
    </div>
  );
}
