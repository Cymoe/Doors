"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

/** The builder goes one step at a time; finished steps collapse into a summary row. */
const STEPS = ["Door type", "Style", "Wood", "Opening size", "Quantity & pickup", "Review"] as const;
type Step = 0 | 1 | 2 | 3 | 4 | 5;

const signed = (n: number) => (n > 0 ? `+${usd(n)}` : n < 0 ? `−${usd(-n)}` : "Included");

export function DoorBuilder({ product, store }: Props) {
  const [step, setStep] = useState<Step>(0);
  const [furthest, setFurthest] = useState<Step>(0);
  const [configuration, setConfiguration] = useState(product.configurations[0]!.code);
  const [style, setStyle] = useState(product.styles[0]!.code);
  const [grade, setGrade] = useState(product.grades[0]!.code);
  const [widthText, setWidthText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [fulfillment, setFulfillment] = useState<Fulfillment>(store.pickup.enabled ? "pickup" : "delivery");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showQuote, setShowQuote] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const config = product.configurations.find((c) => c.code === configuration)!;
  const styleOpt = product.styles.find((s) => s.code === style)!;
  const gradeOpt = product.grades.find((g) => g.code === grade)!;
  const widthIn = widthText ? parseInches(widthText) : undefined;
  const heightIn = heightText ? parseInches(heightText) : undefined;
  const sizeEntered = widthIn !== undefined && heightIn !== undefined;
  const badSize = (widthText !== "" && widthIn === undefined) || (heightText !== "" && heightIn === undefined);

  const isExcluded = (cfg: string, sty: string, grd: string) =>
    product.exclude.some(
      (e) =>
        (e.configuration === undefined || e.configuration === cfg) &&
        (e.grade === undefined || e.grade === grd) &&
        (e.style === undefined || e.style === sty),
    );

  // Price for the entered size, or a standard size until one is entered.
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
  const needsQuote = sizeEntered && !quote.ok && quote.reason === "quote";

  // Move focus to the new step for keyboard and screen reader users, and keep it in view on phones.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = panelRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  function go(next: Step) {
    setStep(next);
    setFurthest((f) => (next > f ? next : f));
    setShowQuote(false);
  }

  function pickConfiguration(code: string) {
    setConfiguration(code);
    if (isExcluded(code, style, grade)) {
      const ok = product.styles.find((s) => !isExcluded(code, s.code, grade));
      if (ok) setStyle(ok.code);
    }
    go(furthest > 1 ? furthest : 1);
  }

  async function checkout() {
    if (!quote.ok || !sizeEntered || submitting) return;
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

  // What each finished step shows in its summary row.
  const answers: Record<number, string> = {
    0: config.name,
    1: styleOpt.name,
    2: gradeOpt.name,
    3: sizeEntered ? `${formatInches(widthIn!)} wide × ${formatInches(heightIn!)} tall` : "",
    4: `${quantity} ${config.leaves > 1 ? (quantity === 1 ? "set" : "sets") : quantity === 1 ? "door" : "doors"} · ${
      fulfillment === "pickup" ? "Pickup" : "Local delivery"
    }`,
  };

  const preview = (
    <DoorPreview
      style={style}
      grade={grade}
      configuration={configuration}
      leaves={config.leaves}
      widthIn={sizeEntered ? widthIn : undefined}
      heightIn={sizeEntered ? heightIn : undefined}
      showDimensions={sizeEntered}
      label={`${config.name}, ${gradeOpt.name}, ${styleOpt.name}`}
    />
  );

  let panel: ReactNode;
  switch (step) {
    case 0:
      panel = (
        <OptionGrid>
          {product.configurations.map((c) => (
            <OptionCard key={c.code} selected={furthest > 0 && configuration === c.code}
              title={c.name} detail={`from ${usd(c.basePrice)}`} note={c.leaves > 1 ? `${c.leaves} doors` : undefined}
              onClick={() => pickConfiguration(c.code)}>
              <DoorPreview style={style} grade={grade} configuration={c.code} leaves={c.leaves} label={c.name} />
            </OptionCard>
          ))}
        </OptionGrid>
      );
      break;
    case 1:
      panel = (
        <OptionGrid>
          {product.styles.map((s) => {
            const disabled = isExcluded(configuration, s.code, grade);
            return (
              <OptionCard key={s.code} selected={furthest > 1 && style === s.code} disabled={disabled}
                title={s.name} detail={disabled ? `Not available as a ${config.name.toLowerCase()}` : signed(s.adder * config.leaves)}
                onClick={() => {
                  setStyle(s.code);
                  go(furthest > 2 ? furthest : 2);
                }}>
                <DoorPreview style={s.code} grade={grade} configuration={configuration} leaves={config.leaves} label={s.name} />
              </OptionCard>
            );
          })}
        </OptionGrid>
      );
      break;
    case 2:
      panel = (
        <OptionGrid>
          {product.grades.map((g) => (
            <OptionCard key={g.code} selected={furthest > 2 && grade === g.code}
              disabled={isExcluded(configuration, style, g.code)}
              title={g.name} detail={signed(g.adder * config.leaves)} note={g.note}
              onClick={() => {
                setGrade(g.code);
                go(furthest > 3 ? furthest : 3);
              }}>
              <DoorPreview style={style} grade={g.code} configuration={configuration} leaves={config.leaves} label={g.name} />
            </OptionCard>
          ))}
        </OptionGrid>
      );
      break;
    case 3:
      panel = (
        <>
          <p className="muted">
            Measure inside the door frame.{" "}
            {config.leaves > 1 ? "Enter the full width; we split it between the two doors. " : ""}
            <Link href="/measure" target="_blank">How to measure</Link>
          </p>
          <div className="fields">
            <label className={`field${widthText && widthIn === undefined ? " error" : ""}`}>
              Width (inches)
              <input inputMode="decimal" autoComplete="off" placeholder={config.leaves > 1 ? "e.g. 60" : "e.g. 32"}
                value={widthText} onChange={(e) => setWidthText(e.target.value)} />
            </label>
            <label className={`field${heightText && heightIn === undefined ? " error" : ""}`}>
              Height (inches)
              <input inputMode="decimal" autoComplete="off" placeholder="e.g. 80"
                value={heightText} onChange={(e) => setHeightText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && quote.ok && sizeEntered && go(4)} />
            </label>
          </div>
          {badSize && <p className="notice error">Use inches, like 32, 32.5 or 32 1/2.</p>}
          {!sizeEntered && !badSize && (
            <p className="hint muted" style={{ fontSize: "0.9rem", marginTop: 10 }}>
              Listed prices cover openings up to {formatInches(product.sizing.standard.width)} ×{" "}
              {formatInches(product.sizing.standard.height)} per door. Up to{" "}
              {formatInches(product.sizing.oversize.width)} × {formatInches(product.sizing.oversize.height)} adds{" "}
              {usd(product.sizing.oversize.adderPerLeaf)} per door.
            </p>
          )}
          {sizeEntered && quote.ok && quote.oversize && (
            <p className="notice">
              Oversize: each door is {formatInches(quote.slabWidthIn)} × {formatInches(heightIn!)}, which adds{" "}
              {usd(product.sizing.oversize.adderPerLeaf * config.leaves)}.
            </p>
          )}
          {sizeEntered && !quote.ok && <p className="notice">{quote.message}</p>}
          {needsQuote ? (
            <QuoteForm productTitle={product.title} details={quoteDetails()} />
          ) : (
            <StepNav onBack={() => go(2)} onNext={() => go(4)} nextDisabled={!sizeEntered || badSize || !quote.ok} />
          )}
        </>
      );
      break;
    case 4:
      panel = (
        <>
          <div className="qty">
            <button type="button" aria-label="One fewer" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
            <output aria-live="polite">{quantity}</output>
            <button type="button" aria-label="One more" onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}>+</button>
            <span className="muted" style={{ marginLeft: 8 }}>
              {config.leaves > 1 ? (quantity === 1 ? "set" : "sets") : quantity === 1 ? "door" : "doors"} this size
            </span>
          </div>
          <div className="choices" style={{ marginTop: 16 }} role="radiogroup" aria-label="Pickup or delivery">
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
          <StepNav onBack={() => go(3)} onNext={() => go(5)} nextLabel="Review order" />
        </>
      );
      break;
    case 5:
      panel =
        quote.ok && totals ? (
          <>
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
                    <td>Total</td>
                    <td>{usd(totals.total)}</td>
                  </tr>
                  {store.depositPercent < 100 && (
                    <>
                      <tr className="due">
                        <td>Due today ({store.depositPercent}% deposit)</td>
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
              <p className="muted" style={{ fontSize: "0.85rem", margin: "10px 0 14px" }}>
                Sold unfinished. Hinges, hardware and tracks not included.
                {product.leadTimeWeeks ? ` Ready in about ${product.leadTimeWeeks.min}–${product.leadTimeWeeks.max} weeks.` : ""}
              </p>
              <button type="button" className="btn block" disabled={submitting} onClick={checkout}>
                {submitting
                  ? "Opening secure checkout…"
                  : store.depositPercent < 100
                    ? `Pay ${usd(totals.dueNow)} deposit`
                    : `Pay ${usd(totals.total)}`}
              </button>
              {checkoutError && <p className="notice error">{checkoutError}</p>}
            </div>
            <p style={{ marginTop: 12 }}>
              <button type="button" className="btn secondary block" onClick={() => setShowQuote((v) => !v)}>
                {showQuote ? "Hide quote request" : "Need something changed? Request a quote"}
              </button>
            </p>
            {showQuote && <QuoteForm productTitle={product.title} details={quoteDetails()} />}
          </>
        ) : (
          <>
            <p className="notice">{sizeEntered && !quote.ok ? quote.message : "Enter your opening size first."}</p>
            <StepNav onBack={() => go(3)} onNext={() => go(3)} nextLabel="Fix the size" />
          </>
        );
      break;
  }

  function quoteDetails() {
    return `${config.name}, ${gradeOpt.name}, ${styleOpt.name}${
      widthText || heightText ? `, opening ${widthText || "?"} × ${heightText || "?"} in` : ""
    }, qty ${quantity}, ${fulfillment}`;
  }

  const runningPrice = quote.ok ? quote.unitPrice * quantity : undefined;

  return (
    <div className="builder">
      <div className="preview">
        {preview}
        <div className="caption">
          <strong>{config.name} · {styleOpt.name} · {gradeOpt.name}</strong>
          {runningPrice !== undefined && (
            <>
              <br />
              {sizeEntered ? usd(runningPrice) : `from ${usd(runningPrice)}`}
            </>
          )}
        </div>
      </div>

      <div>
        <p className="eyebrow">Built to order</p>
        <h1 style={{ fontSize: "clamp(1.7rem, 4vw, 2.4rem)" }}>{product.title}</h1>

        <ol className="progress" aria-label="Steps">
          {STEPS.map((name, i) => (
            <li key={name} className={i === step ? "current" : i <= furthest ? "reached" : ""}
              aria-current={i === step ? "step" : undefined}>
              <span className="sr-only">{name}</span>
            </li>
          ))}
        </ol>

        {STEPS.map((name, i) => {
          if (i !== step && i <= furthest && i < 5) {
            // Finished step: collapsed summary row with a Change link.
            return (
              <div key={name} className="done-row">
                <span className="done-label">{name}</span>
                <span className="done-value">{answers[i]}</span>
                <button type="button" className="link" onClick={() => go(i as Step)} aria-label={`Change ${name.toLowerCase()}`}>
                  Change
                </button>
              </div>
            );
          }
          if (i === step) {
            return (
              <section key={name} className="step-panel" ref={panelRef} tabIndex={-1} aria-labelledby={`step-${i}`}>
                <h2 id={`step-${i}`}>
                  <span className="step-num">Step {i + 1} of {STEPS.length}</span>
                  {name === "Review" ? "Review your order" : `Choose your ${name.toLowerCase()}`}
                </h2>
                {i > 0 && i < 3 && (
                  <button type="button" className="link back" onClick={() => go((i - 1) as Step)}>← Back</button>
                )}
                {panel}
              </section>
            );
          }
          // Upcoming step: just its name, greyed out.
          return (
            <div key={name} className="todo-row">
              <span className="done-label">{name}</span>
            </div>
          );
        })}

        <details className="about">
          <summary>About this door</summary>
          {product.description.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className="muted">{para.replace(/\s*\n\s*/g, " ")}</p>
          ))}
          {product.highlights.length > 0 && (
            <ul className="prose">{product.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
          )}
          {Object.keys(product.specs).length > 0 && (
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
          )}
        </details>
      </div>
    </div>
  );
}

function OptionGrid({ children }: { children: ReactNode }) {
  return <div className="options">{children}</div>;
}

function OptionCard(props: {
  title: string;
  detail: string;
  note?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="option" aria-pressed={props.selected} disabled={props.disabled} onClick={props.onClick}>
      <span className="option-art" aria-hidden="true">{props.children}</span>
      <span className="option-title">{props.title}</span>
      <span className="option-detail">{props.detail}</span>
      {props.note && <span className="option-note">{props.note}</span>}
    </button>
  );
}

function StepNav({ onBack, onNext, nextDisabled, nextLabel = "Continue" }: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="step-nav">
      <button type="button" className="btn secondary" onClick={onBack}>Back</button>
      <button type="button" className="btn" onClick={onNext} disabled={nextDisabled}>{nextLabel}</button>
    </div>
  );
}
