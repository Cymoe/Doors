"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AddonOffer } from "@/cart";
import type { CartItem } from "@/cart-schema";
import { MAX_QUANTITY, usd, type PriceLine } from "@/pricing";
import { cart } from "./cart-store";

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

/** The open step. Takes focus when the customer moves to it, so keyboard users land on it. */
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
    if (!mounted.current) {
      mounted.current = true;
      if (props.index === 0) return; // don't steal focus on page load
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
      {unit[0] && <span className="muted" style={{ marginLeft: 8 }}>{value === 1 ? unit[0] : unit[1]}</span>}
    </div>
  );
}

/* ---------- Add-ons ---------- */

/** Per add-on: whether it's wanted, and the options picked so far. */
export type AddonState = Record<string, { on: boolean; picks: Record<string, string> }>;

export interface ResolvedAddon {
  key: string;
  label: string;
  sku: string;
  details: string;
  price: number;
}

/** Turns the add-on step's state into chosen SKUs. `complete` is false while a wanted add-on is missing a pick. */
export function resolveAddons(offers: AddonOffer[], state: AddonState): { complete: boolean; chosen: ResolvedAddon[] } {
  const chosen: ResolvedAddon[] = [];
  let complete = true;
  for (const o of offers) {
    const s = state[o.key];
    if (!s?.on) continue;
    const want = { ...s.picks, ...o.fixed };
    const v = o.product.variants.find((x) => o.product.optionNames.every((n) => x.options[n] === want[n]));
    if (!v || !v.available) {
      complete = false;
      continue;
    }
    const details = o.product.optionNames.filter((n) => !(n in o.fixed)).map((n) => v.options[n]).join(", ");
    chosen.push({ key: o.key, label: o.label, sku: v.sku, details, price: v.price });
  }
  return { complete, chosen };
}

const minPrice = (o: AddonOffer) =>
  Math.min(...o.product.variants.filter((v) => Object.entries(o.fixed).every(([k, x]) => v.options[k] === x)).map((v) => v.price));

export function AddonsStep({ offers, state, onChange }: {
  offers: AddonOffer[];
  state: AddonState;
  onChange: (s: AddonState) => void;
}) {
  return (
    <div className="addons">
      {offers.map((o) => {
        const s = state[o.key] ?? { on: false, picks: {} };
        const free = o.product.optionNames.filter((n) => !(n in o.fixed));
        const set = (next: Partial<typeof s>) => onChange({ ...state, [o.key]: { ...s, ...next } });
        return (
          <div key={o.key} className={`addon${s.on ? " on" : ""}`}>
            <label className="addon-head">
              <input type="checkbox" checked={s.on} onChange={(e) => set({ on: e.target.checked })} />
              <span>
                <strong>{o.label}</strong>
                <span className="addon-price"> from {usd(minPrice(o))}</span>
                {o.description && <span className="addon-desc">{o.description}</span>}
                {o.note && <span className="addon-note">{o.note}</span>}
              </span>
            </label>
            {s.on &&
              free.map((name, k) => {
                // Values still possible given the fixed options and the picks before this one.
                const before = { ...o.fixed, ...Object.fromEntries(free.slice(0, k).filter((n) => s.picks[n]).map((n) => [n, s.picks[n]!])) };
                const pool = o.product.variants.filter((v) => Object.entries(before).every(([kk, x]) => v.options[kk] === x));
                const values = [...new Set(pool.map((v) => v.options[name]!))];
                return (
                  <div key={name} className="addon-opt">
                    <span className="addon-opt-name">{name}</span>
                    <div className="chips small">
                      {values.map((val) => (
                        <button key={val} type="button" className="chip" aria-pressed={s.picks[name] === val}
                          onClick={() => {
                            // Clear later picks when an earlier one changes.
                            const picks: Record<string, string> = {};
                            for (const n of free.slice(0, k)) if (s.picks[n]) picks[n] = s.picks[n]!;
                            picks[name] = val;
                            set({ picks });
                          }}>
                          <span className="chip-title">{val}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Review & add to cart ---------- */

export function AddToCart(props: {
  lines: PriceLine[];
  addons: ResolvedAddon[];
  quantity: number;
  onQuantity: (n: number) => void;
  unit: [string, string];
  note?: string;
  shippingNote?: string;
  item: Omit<CartItem, "id" | "quantity">;
}) {
  const [added, setAdded] = useState(false);
  const each = props.lines.reduce((a, l) => a + l.amount, 0) + props.addons.reduce((a, x) => a + x.price, 0);
  // A new choice means it hasn't been added yet. (Compare by value: `item` is a new object every render.)
  const itemKey = JSON.stringify(props.item);
  useEffect(() => setAdded(false), [itemKey, props.quantity]);

  return (
    <div className="summary" aria-live="polite">
      <table>
        <tbody>
          {props.lines.map((l) => (
            <tr key={l.label}>
              <td>{l.label}</td>
              <td>{l.amount < 0 ? `−${usd(-l.amount)}` : usd(l.amount)}</td>
            </tr>
          ))}
          {props.addons.map((a) => (
            <tr key={a.key}>
              <td>{a.label}{a.details ? ` (${a.details})` : ""}</td>
              <td>{usd(a.price)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Each</td>
            <td>{usd(each)}</td>
          </tr>
        </tbody>
      </table>
      <div className="add-row">
        <QuantityPicker value={props.quantity} onChange={props.onQuantity} unit={props.unit} />
        <strong className="line-total">{usd(each * props.quantity)}</strong>
      </div>
      {props.note && <p className="muted small-print">{props.note}</p>}
      {added ? (
        <div className="added">
          <p className="notice ok">Added to your cart.</p>
          <div className="step-nav">
            <Link className="btn secondary" href="/">Keep shopping</Link>
            <Link className="btn" href="/cart">View cart &amp; check out</Link>
          </div>
        </div>
      ) : (
        <button type="button" className="btn block" onClick={() => {
          cart.add({ ...props.item, quantity: props.quantity });
          setAdded(true);
        }}>
          Add to cart
        </button>
      )}
      {props.shippingNote && <p className="muted small-print">{props.shippingNote}</p>}
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
