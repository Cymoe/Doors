"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { DoorProduct, StoreConfig } from "@/schema";
import { formatInches, orderTotals, parseInches, quoteDoor, usd, type Fulfillment } from "@/pricing";
import { QuoteForm } from "./QuoteForm";
import { Description } from "./Description";
import {
  DoneRow,
  FulfillmentPicker,
  OrderSummary,
  Progress,
  QuantityPicker,
  StepNav,
  StepPanel,
  TodoRow,
  defaultFulfillment,
} from "./steps";

interface Props {
  product: DoorProduct;
  store: StoreConfig;
}

/** The custom door, built to the customer's opening, chosen one step at a time. */
const STEPS = ["Door type", "Style", "Wood", "Opening size", "Quantity & pickup", "Review"] as const;
const SIZE = 3;
const QTY = 4;
const REVIEW = 5;

const signed = (n: number) => (n > 0 ? `+${usd(n)}` : n < 0 ? `−${usd(-n)}` : "Included");

export function DoorBuilder({ product, store }: Props) {
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [configuration, setConfiguration] = useState(product.configurations[0]!.code);
  const [style, setStyle] = useState(product.styles[0]!.code);
  const [grade, setGrade] = useState(product.grades[0]!.code);
  const [widthText, setWidthText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [fulfillment, setFulfillment] = useState<Fulfillment>(defaultFulfillment(store));
  const [showQuote, setShowQuote] = useState(false);

  const config = product.configurations.find((c) => c.code === configuration)!;
  const styleOpt = product.styles.find((s) => s.code === style)!;
  const gradeOpt = product.grades.find((g) => g.code === grade)!;
  const widthIn = widthText ? parseInches(widthText) : undefined;
  const heightIn = heightText ? parseInches(heightText) : undefined;
  const sizeEntered = widthIn !== undefined && heightIn !== undefined;
  const badSize = (widthText !== "" && widthIn === undefined) || (heightText !== "" && heightIn === undefined);
  const pair = config.leaves > 1;

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

  function go(next: number) {
    setStep(next);
    setFurthest((f) => Math.max(f, next));
    setShowQuote(false);
  }
  /** After a pick, continue where the customer left off (if they came back to change something). */
  const advance = (from: number) => go(Math.max(from + 1, Math.min(furthest, REVIEW)));

  const quoteDetails = () =>
    `${config.name}, ${gradeOpt.name}, ${styleOpt.name}${
      widthText || heightText ? `, opening ${widthText || "?"} × ${heightText || "?"} in` : ""
    }, qty ${quantity}, ${fulfillment}`;

  const unitWord = pair ? (quantity === 1 ? "set" : "sets") : quantity === 1 ? "door" : "doors";
  const answers: Record<number, string> = {
    0: config.name,
    1: styleOpt.name,
    2: gradeOpt.name,
    3: sizeEntered ? `${formatInches(widthIn!)} wide × ${formatInches(heightIn!)} tall` : "",
    4: `${quantity} ${unitWord} · ${fulfillment === "pickup" ? "Pickup" : "Local delivery"}`,
  };

  let panel: ReactNode;
  switch (step) {
    case 0:
      panel = (
        <div className="options">
          {product.configurations.map((c) => (
            <OptionCard key={c.code} image={c.image} selected={furthest > 0 && configuration === c.code}
              title={c.name} detail={`from ${usd(c.basePrice)}`} note={c.leaves > 1 ? `${c.leaves} doors` : undefined}
              onClick={() => {
                setConfiguration(c.code);
                if (isExcluded(c.code, style, grade)) {
                  const ok = product.styles.find((s) => !isExcluded(c.code, s.code, grade));
                  if (ok) setStyle(ok.code);
                }
                advance(0);
              }} />
          ))}
        </div>
      );
      break;
    case 1:
      panel = (
        <div className="options">
          {product.styles.map((s) => {
            const disabled = isExcluded(configuration, s.code, grade);
            return (
              <OptionCard key={s.code} image={s.image} selected={furthest > 1 && style === s.code} disabled={disabled}
                title={s.name} detail={disabled ? `Not available as a ${config.name.toLowerCase()}` : signed(s.adder * config.leaves)}
                onClick={() => {
                  setStyle(s.code);
                  advance(1);
                }} />
            );
          })}
        </div>
      );
      break;
    case 2:
      panel = (
        <div className="options">
          {product.grades.map((g) => (
            <OptionCard key={g.code} image={g.image} selected={furthest > 2 && grade === g.code}
              disabled={isExcluded(configuration, style, g.code)} title={g.name} detail={signed(g.adder * config.leaves)}
              note={g.note}
              onClick={() => {
                setGrade(g.code);
                advance(2);
              }} />
          ))}
        </div>
      );
      break;
    case SIZE:
      panel = (
        <>
          <p className="muted">
            Measure inside the door frame.{" "}
            {pair ? "Enter the full width; we split it between the two doors. " : ""}
            <Link href="/measure" target="_blank">How to measure</Link>
          </p>
          <div className="fields">
            <label className={`field${widthText && widthIn === undefined ? " error" : ""}`}>
              Width (inches)
              <input inputMode="decimal" autoComplete="off" placeholder={pair ? "e.g. 60" : "e.g. 32"}
                value={widthText} onChange={(e) => setWidthText(e.target.value)} />
            </label>
            <label className={`field${heightText && heightIn === undefined ? " error" : ""}`}>
              Height (inches)
              <input inputMode="decimal" autoComplete="off" placeholder="e.g. 80"
                value={heightText} onChange={(e) => setHeightText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && quote.ok && sizeEntered && go(QTY)} />
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
            <StepNav onBack={() => go(2)} onNext={() => go(QTY)} nextDisabled={!sizeEntered || badSize || !quote.ok} />
          )}
        </>
      );
      break;
    case QTY:
      panel = (
        <>
          <QuantityPicker value={quantity} onChange={setQuantity}
            unit={pair ? ["set this size", "sets this size"] : ["door this size", "doors this size"]} />
          <FulfillmentPicker store={store} value={fulfillment} onChange={setFulfillment} />
          <StepNav onBack={() => go(SIZE)} onNext={() => go(REVIEW)} nextLabel="Review order" />
        </>
      );
      break;
    default:
      panel =
        quote.ok && totals && sizeEntered ? (
          <>
            <OrderSummary
              lines={quote.lines}
              quantity={quantity}
              totals={totals}
              depositPercent={store.depositPercent}
              fulfillment={fulfillment}
              note={`Sold unfinished. Hinges, hardware and tracks not included.${
                product.leadTimeWeeks ? ` Ready in about ${product.leadTimeWeeks.min}–${product.leadTimeWeeks.max} weeks.` : ""
              }`}
              checkoutBody={{ handle: product.handle, selection: { configuration, grade, style, widthIn, heightIn, quantity } }}
            />
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
            <StepNav onNext={() => go(SIZE)} nextLabel="Fix the size" />
          </>
        );
  }

  const runningPrice = quote.ok ? quote.unitPrice * quantity : undefined;

  return (
    <div className="builder">
      <div className="preview">
        {styleOpt.image && <img className="preview-photo" src={styleOpt.image} alt={`${styleOpt.name} door`} />}
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
        <h1 className="product-title">{product.title}</h1>

        <Progress steps={STEPS} current={step} furthest={furthest} />

        {STEPS.map((name, i) => {
          if (i === step) {
            return (
              <StepPanel key={name} index={i} total={STEPS.length}
                heading={i === REVIEW ? "Review your order" : i === QTY ? "Quantity & pickup" : `Choose your ${name.toLowerCase()}`}
                onBack={i > 0 && i < SIZE ? () => go(i - 1) : undefined}>
                {panel}
              </StepPanel>
            );
          }
          if (i <= furthest && i < REVIEW && answers[i]) {
            return <DoneRow key={name} label={name} value={answers[i]!} onChange={() => go(i)} />;
          }
          return <TodoRow key={name} label={name} />;
        })}

        <details className="about">
          <summary>About this door</summary>
          <Description text={product.description} />
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

function OptionCard(props: {
  image?: string;
  title: string;
  detail: string;
  note?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="option" aria-pressed={props.selected} disabled={props.disabled} onClick={props.onClick}>
      {props.image && (
        <span className="option-art photo" aria-hidden="true">
          <img src={props.image} alt="" loading="lazy" />
        </span>
      )}
      <span className="option-title">{props.title}</span>
      <span className="option-detail">{props.detail}</span>
      {props.note && <span className="option-note">{props.note}</span>}
    </button>
  );
}
