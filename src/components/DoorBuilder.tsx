"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DoorProduct, StoreConfig } from "@/schema";
import {
  MAX_QUANTITY,
  formatInches,
  orderTotals,
  parseInches,
  quoteDoor,
  usd,
  type Fulfillment,
} from "@/pricing";
import { DoorPreview } from "./DoorPreview";
import { QuoteForm } from "./QuoteForm";

interface Props {
  product: DoorProduct;
  store: StoreConfig;
}

export function DoorBuilder({ product, store }: Props) {
  const [configuration, setConfiguration] = useState(product.configurations[0]!.code);
  const [grade, setGrade] = useState(product.grades[0]!.code);
  const [style, setStyle] = useState(product.styles[0]!.code);
  const [widthText, setWidthText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [fulfillment, setFulfillment] = useState<Fulfillment>(store.pickup.enabled ? "pickup" : "delivery");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showQuote, setShowQuote] = useState(false);

  const config = product.configurations.find((c) => c.code === configuration)!;
  const widthIn = widthText ? parseInches(widthText) : undefined;
  const heightIn = heightText ? parseInches(heightText) : undefined;
  const sizeEntered = widthIn !== undefined && heightIn !== undefined;
  const sizeError =
    (widthText && widthIn === undefined) || (heightText && heightIn === undefined)
      ? 'Use inches, like 32, 32.5 or 32 1/2.'
      : null;

  const isExcluded = (cfg: string, sty: string, grd = grade) =>
    product.exclude.some(
      (e) =>
        (e.configuration === undefined || e.configuration === cfg) &&
        (e.grade === undefined || e.grade === grd) &&
        (e.style === undefined || e.style === sty),
    );

  // Price for the entered size, or for a standard size until one is entered.
  const quote = useMemo(
    () =>
      quoteDoor(product, {
        configuration,
        grade,
        style,
        widthIn: widthIn ?? product.sizing.standard.width * config.leaves,
        heightIn: heightIn ?? product.sizing.standard.height,
        quantity,
      }),
    [product, configuration, grade, style, widthIn, heightIn, quantity, config.leaves],
  );
  const totals = quote.ok ? orderTotals(quote.unitPrice, quantity, fulfillment, store) : null;
  const canCheckout = quote.ok && sizeEntered && !sizeError && !submitting;

  const styleName = product.styles.find((s) => s.code === style)!.name;
  const gradeName = product.grades.find((g) => g.code === grade)!.name;

  function chooseConfiguration(code: string) {
    setConfiguration(code);
    // If the current style isn't built in this configuration, switch to one that is.
    if (isExcluded(code, style)) {
      const firstOk = product.styles.find((s) => !isExcluded(code, s.code));
      if (firstOk) setStyle(firstOk.code);
    }
  }

  async function checkout() {
    if (!canCheckout) return;
    setSubmitting(true);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: product.handle,
          selection: { configuration, grade, style, widthIn, heightIn, quantity },
          fulfillment,
        }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Checkout failed. Please try again.");
      window.location.href = body.url;
    } catch (e) {
      setCheckoutError((e as Error).message);
      setSubmitting(false);
    }
  }

  const needsQuote = !quote.ok && quote.reason === "quote";
  const sizeLabel = config.leaves > 1 ? `total for both doors` : "";

  return (
    <div className="builder">
      <div className="preview">
        <DoorPreview
          style={style}
          grade={grade}
          configuration={configuration}
          leaves={config.leaves}
          widthIn={sizeEntered ? widthIn : undefined}
          heightIn={sizeEntered ? heightIn : undefined}
          showDimensions={sizeEntered}
          label={`${config.name}, ${gradeName}, ${styleName}`}
        />
        <div className="caption">
          {config.name} · {gradeName} · {styleName}
          {sizeEntered && widthIn && heightIn ? ` · ${formatInches(widthIn)} × ${formatInches(heightIn)}` : ""}
          <br />
          Drawing for illustration; your door is built to your measurements.
        </div>
      </div>

      <div>
        <p className="eyebrow">Built to order</p>
        <h1>{product.title}</h1>
        {product.description.split(/\n\s*\n/).map((para, i) => (
          <p key={i} className="muted">{para.replace(/\s*\n\s*/g, " ")}</p>
        ))}

        <section className="step" aria-labelledby="cfg">
          <h3 id="cfg">1. Door type</h3>
          <div className="choices" role="radiogroup" aria-labelledby="cfg">
            {product.configurations.map((c) => (
              <div className="choice" key={c.code}>
                <input type="radio" id={`cfg-${c.code}`} name="configuration" value={c.code}
                  checked={configuration === c.code} onChange={() => chooseConfiguration(c.code)} />
                <label htmlFor={`cfg-${c.code}`}>
                  {c.name}
                  <span>from {usd(c.basePrice)}{c.leaves > 1 ? ` · ${c.leaves} doors` : ""}</span>
                </label>
              </div>
            ))}
          </div>
        </section>

        <section className="step" aria-labelledby="sty">
          <h3 id="sty">2. Style</h3>
          <div className="choices" role="radiogroup" aria-labelledby="sty">
            {product.styles.map((s) => {
              const disabled = isExcluded(configuration, s.code);
              return (
                <div className="choice" key={s.code}>
                  <input type="radio" id={`sty-${s.code}`} name="style" value={s.code} disabled={disabled}
                    checked={style === s.code} onChange={() => setStyle(s.code)} />
                  <label htmlFor={`sty-${s.code}`}>
                    {s.name}
                    <span>
                      {disabled
                        ? "Not available"
                        : s.adder
                          ? `+${usd(s.adder * config.leaves)}`
                          : "Included"}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        <section className="step" aria-labelledby="grd">
          <h3 id="grd">3. Wood</h3>
          <div className="choices" role="radiogroup" aria-labelledby="grd">
            {product.grades.map((g) => (
              <div className="choice" key={g.code}>
                <input type="radio" id={`grd-${g.code}`} name="grade" value={g.code}
                  checked={grade === g.code} onChange={() => setGrade(g.code)} />
                <label htmlFor={`grd-${g.code}`}>
                  {g.name}
                  <span>
                    {g.adder > 0 ? `+${usd(g.adder * config.leaves)}` : g.adder < 0 ? `−${usd(-g.adder * config.leaves)}` : "Included"}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </section>

        <section className="step" aria-labelledby="size">
          <h3 id="size">
            4. Opening size <small><Link href="/measure">How to measure</Link></small>
          </h3>
          <div className="fields">
            <label className={`field${widthText && widthIn === undefined ? " error" : ""}`}>
              Width (inches)
              <input inputMode="decimal" autoComplete="off" placeholder={config.leaves > 1 ? "e.g. 60" : "e.g. 32"}
                value={widthText} onChange={(e) => setWidthText(e.target.value)} />
              <span className="hint">{sizeLabel || "Inside the door frame"}</span>
            </label>
            <label className={`field${heightText && heightIn === undefined ? " error" : ""}`}>
              Height (inches)
              <input inputMode="decimal" autoComplete="off" placeholder="e.g. 80"
                value={heightText} onChange={(e) => setHeightText(e.target.value)} />
              <span className="hint">Floor to top of the frame</span>
            </label>
          </div>
          {sizeError && <p className="notice error">{sizeError}</p>}
          {!sizeEntered && (
            <p className="hint muted" style={{ fontSize: "0.9rem", marginTop: 10 }}>
              Listed prices cover doors up to {formatInches(product.sizing.standard.width)} ×{" "}
              {formatInches(product.sizing.standard.height)} each. Larger doors, up to{" "}
              {formatInches(product.sizing.oversize.width)} × {formatInches(product.sizing.oversize.height)}, add{" "}
              {usd(product.sizing.oversize.adderPerLeaf)} per door.
            </p>
          )}
          {quote.ok && quote.oversize && sizeEntered && (
            <p className="notice">
              Oversize: each door is {formatInches(quote.slabWidthIn)} × {formatInches(heightIn!)}, which adds{" "}
              {usd(product.sizing.oversize.adderPerLeaf)} per door.
            </p>
          )}
          {!quote.ok && <p className={`notice${quote.reason === "invalid" ? " error" : ""}`}>{quote.message}</p>}
        </section>

        <section className="step" aria-labelledby="qty">
          <h3 id="qty">5. Quantity and pickup</h3>
          <div className="qty">
            <button type="button" aria-label="One fewer" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
            <output aria-live="polite">{quantity}</output>
            <button type="button" aria-label="One more" onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}>+</button>
            <span className="muted" style={{ marginLeft: 8 }}>
              {quantity === 1 ? (config.leaves > 1 ? "set" : "door") : config.leaves > 1 ? "sets" : "doors"} this size
            </span>
          </div>
          <div className="choices" style={{ marginTop: 14 }} role="radiogroup" aria-label="Pickup or delivery">
            {store.pickup.enabled && (
              <div className="choice">
                <input type="radio" id="ful-pickup" name="fulfillment" checked={fulfillment === "pickup"}
                  onChange={() => setFulfillment("pickup")} />
                <label htmlFor="ful-pickup">Pickup<span>{store.pickup.location} · free</span></label>
              </div>
            )}
            {store.localDelivery.enabled && (
              <div className="choice">
                <input type="radio" id="ful-delivery" name="fulfillment" checked={fulfillment === "delivery"}
                  onChange={() => setFulfillment("delivery")} />
                <label htmlFor="ful-delivery">
                  Local delivery<span>{store.localDelivery.area} · {usd(store.localDelivery.fee)}</span>
                </label>
              </div>
            )}
          </div>
        </section>

        {quote.ok && totals && (
          <div className="summary" aria-live="polite">
            <table>
              <tbody>
                {quote.lines.map((l) => (
                  <tr key={l.label}>
                    <td>{l.label}</td>
                    <td>{l.amount < 0 ? `−${usd(-l.amount)}` : usd(l.amount)}</td>
                  </tr>
                ))}
                {quantity > 1 && (
                  <tr>
                    <td>× {quantity}</td>
                    <td>{usd(totals.subtotal)}</td>
                  </tr>
                )}
                {totals.delivery > 0 && (
                  <tr>
                    <td>Local delivery</td>
                    <td>{usd(totals.delivery)}</td>
                  </tr>
                )}
                <tr className="total">
                  <td>Total{sizeEntered ? "" : " (standard size)"}</td>
                  <td>{usd(totals.total)}</td>
                </tr>
                {store.depositPercent < 100 && (
                  <>
                    <tr className="due">
                      <td>Due today ({store.depositPercent}% deposit)</td>
                      <td>{usd(totals.dueNow)}</td>
                    </tr>
                    <tr>
                      <td className="muted">Due at {fulfillment === "pickup" ? "pickup" : "delivery"}</td>
                      <td className="muted">{usd(totals.balance)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "10px 0 14px" }}>
              Sold unfinished. Hinges, hardware and tracks not included.
              {product.leadTimeWeeks ? ` Ready in about ${product.leadTimeWeeks.min}–${product.leadTimeWeeks.max} weeks.` : ""}
            </p>
            <button type="button" className="btn block" disabled={!canCheckout} onClick={checkout}>
              {submitting
                ? "Opening secure checkout…"
                : !sizeEntered
                  ? "Enter your opening size"
                  : store.depositPercent < 100
                    ? `Pay ${usd(totals.dueNow)} deposit`
                    : `Pay ${usd(totals.total)}`}
            </button>
            {checkoutError && <p className="notice error">{checkoutError}</p>}
          </div>
        )}

        <p style={{ marginTop: 16 }}>
          {needsQuote ? null : (
            <button type="button" className="btn secondary block" onClick={() => setShowQuote((v) => !v)}>
              {showQuote ? "Hide quote request" : "Something custom? Request a quote"}
            </button>
          )}
        </p>
        {(needsQuote || showQuote) && (
          <QuoteForm
            productTitle={product.title}
            details={`${config.name}, ${gradeName}, ${styleName}${widthText || heightText ? `, opening ${widthText || "?"} × ${heightText || "?"} in` : ""}, qty ${quantity}, ${fulfillment}`}
          />
        )}

        {product.highlights.length > 0 && (
          <section className="step">
            <h3>Why solid wood</h3>
            <ul className="prose">
              {product.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </section>
        )}
        {Object.keys(product.specs).length > 0 && (
          <section className="step">
            <h3>Specifications</h3>
            <table className="specs">
              <tbody>
                {Object.entries(product.specs).map(([k, v]) => (
                  <tr key={k}>
                    <th>{k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</th>
                    <td>{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
