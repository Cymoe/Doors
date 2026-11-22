"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StoreConfig } from "@/schema";
import { MAX_QUANTITY, usd, type Fulfillment, type OrderTotals, type PriceLine } from "@/pricing";

/** Shared pieces of the one-step-at-a-time product flow. */

export function Progress({ steps, current, furthest }: { steps: readonly string[]; current: number; furthest: number }) {
  return (
    <ol className="progress" aria-label="Steps">
      {steps.map((name, i) => (
        <li key={name} className={i === current ? "current" : i <= furthest ? "reached" : ""}
          aria-current={i === current ? "step" : undefined}>
          <span className="sr-only">{name}</span>
        </li>
      ))}
    </ol>
  );
}

export function DoneRow({ label, value, onChange }: { label: string; value: string; onChange: () => void }) {
  return (
    <div className="done-row">
      <span className="done-label">{label}</span>
      <span className="done-value">{value}</span>
      <button type="button" className="link" onClick={onChange} aria-label={`Change ${label.toLowerCase()}`}>
        Change
      </button>
    </div>
  );
}

export function TodoRow({ label }: { label: string }) {
  return (
    <div className="todo-row">
      <span className="done-label">{label}</span>
    </div>
  );
}

/** The open step. Takes focus when it opens (after the first render) so keyboard users land on it. */
export function StepPanel(props: {
  index: number;
  total: number;
  heading: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    // Don't steal focus or scroll on page load; only when the customer moves between steps.
    if (!mounted.current) {
      mounted.current = true;
      if (props.index === 0) return;
    }
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [props.index]);

  return (
    <section className="step-panel" ref={ref} tabIndex={-1} aria-labelledby={`step-${props.index}`}>
      <h2 id={`step-${props.index}`}>
        <span className="step-num">Step {props.index + 1} of {props.total}</span>
        {props.heading}
      </h2>
      {props.onBack && (
        <button type="button" className="link back" onClick={props.onBack}>← Back</button>
      )}
      {props.children}
    </section>
  );
}

export function StepNav({ onBack, onNext, nextDisabled, nextLabel = "Continue" }: {
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="step-nav">
      {onBack && <button type="button" className="btn secondary" onClick={onBack}>Back</button>}
      <button type="button" className="btn" onClick={onNext} disabled={nextDisabled}>{nextLabel}</button>
    </div>
  );
}

export function QuantityPicker({ value, onChange, unit }: { value: number; onChange: (n: number) => void; unit: [string, string] }) {
  return (
    <div className="qty">
      <button type="button" aria-label="One fewer" onClick={() => onChange(Math.max(1, value - 1))}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="One more" onClick={() => onChange(Math.min(MAX_QUANTITY, value + 1))}>+</button>
      <span className="muted" style={{ marginLeft: 8 }}>{value === 1 ? unit[0] : unit[1]}</span>
    </div>
  );
}

export function FulfillmentPicker({ store, value, onChange }: {
  store: StoreConfig;
  value: Fulfillment;
  onChange: (f: Fulfillment) => void;
}) {
  return (
    <div className="choices" style={{ marginTop: 16 }} role="radiogroup" aria-label="Pickup or delivery">
      {store.pickup.enabled && (
        <div className="choice">
          <input type="radio" id="ful-pickup" name="fulfillment" checked={value === "pickup"} onChange={() => onChange("pickup")} />
          <label htmlFor="ful-pickup">Pickup<span>{store.pickup.location} · free</span></label>
        </div>
      )}
      {store.localDelivery.enabled && (
        <div className="choice">
          <input type="radio" id="ful-delivery" name="fulfillment" checked={value === "delivery"} onChange={() => onChange("delivery")} />
          <label htmlFor="ful-delivery">
            Local delivery<span>{store.localDelivery.area} · {usd(store.localDelivery.fee)}</span>
          </label>
        </div>
      )}
    </div>
  );
}

export const defaultFulfillment = (store: StoreConfig): Fulfillment => (store.pickup.enabled ? "pickup" : "delivery");

/** Order summary with the pay button. `body` is what /api/checkout needs for this product. */
export function OrderSummary(props: {
  lines: PriceLine[];
  quantity: number;
  totals: OrderTotals;
  depositPercent: number;
  fulfillment: Fulfillment;
  note?: string;
  checkoutBody: Record<string, unknown>;
}) {
  const { lines, quantity, totals, depositPercent, fulfillment } = props;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deposit = depositPercent < 100;

  async function checkout() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...props.checkoutBody, fulfillment }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Checkout failed. Please try again.");
      window.location.href = body.url;
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="summary" aria-live="polite">
      <table>
        <tbody>
          {lines.map((l) => (
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
            <td>Total</td>
            <td>{usd(totals.total)}</td>
          </tr>
          {deposit && (
            <>
              <tr className="due">
                <td>Due today ({depositPercent}% deposit)</td>
                <td>{usd(totals.dueNow)}</td>
              </tr>
              <tr>
                <td className="muted">Due at {fulfillment}</td>
                <td className="muted">{usd(totals.balance)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      {props.note && <p className="muted" style={{ fontSize: "0.85rem", margin: "10px 0 14px" }}>{props.note}</p>}
      <button type="button" className="btn block" style={{ marginTop: props.note ? 0 : 14 }} disabled={submitting} onClick={checkout}>
        {submitting ? "Opening secure checkout…" : deposit ? `Pay ${usd(totals.dueNow)} deposit` : `Pay ${usd(totals.total)}`}
      </button>
      {error && <p className="notice error">{error}</p>}
    </div>
  );
}

/** Photo gallery: one large photo and thumbnails. */
export function Gallery({ images, title }: { images: { src: string; alt: string }[]; title: string }) {
  const [i, setI] = useState(0);
  const current = images[Math.min(i, images.length - 1)];
  if (!current) return null;
  return (
    <div className="gallery">
      <img className="preview-photo" src={current.src} alt={current.alt || title} />
      {images.length > 1 && (
        <div className="thumbs">
          {images.map((img, k) => (
            <button key={img.src} type="button" aria-label={`Photo ${k + 1}`} aria-pressed={k === i} onClick={() => setI(k)}>
              <img src={img.src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
