"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AddonOffer } from "@/cart";
import type { DoorProduct } from "@/schema";
import { formatInches, parseInches, quoteDoor, usd } from "@/pricing";
import { QuoteForm } from "./QuoteForm";
import { Description } from "./Description";
import { AddToCart, AddonsStep, DoneRow, Progress, StepPanel, TodoRow, resolveAddons, type AddonState } from "./steps";

interface Props {
  product: DoorProduct;
  /** Add-ons offered for each configuration code. */
  addonsByConfiguration: Record<string, AddonOffer[]>;
  shippingNote?: string;
}

type StepKey = "type" | "style" | "build";
const STEPS: StepKey[] = ["type", "style", "build"];
const LABELS: Record<StepKey, string> = { type: "Door type", style: "Style", build: "Wood, size & add-ons" };

const signed = (n: number) => (n > 0 ? `+${usd(n)}` : n < 0 ? `−${usd(-n)}` : "Included");

/**
 * The custom door. Door type and style are picked one at a time; after that,
 * wood, opening size, add-ons and quantity are all on one screen.
 */
export function DoorBuilder({ product, addonsByConfiguration, shippingNote }: Props) {
  const [current, setCurrent] = useState<StepKey>("type");
  const [furthest, setFurthest] = useState(0);
  const [configuration, setConfiguration] = useState(product.configurations[0]!.code);
  const [style, setStyle] = useState(product.styles[0]!.code);
  const [grade, setGrade] = useState(product.grades[0]!.code);
  const [widthText, setWidthText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [addonState, setAddonState] = useState<AddonState>({});
  const [quantity, setQuantity] = useState(1);
  const [showQuote, setShowQuote] = useState(false);
  /** Set once the customer moves between steps; until then a step doesn't grab focus (page load). */
  const [moved, setMoved] = useState(false);

  const offers = addonsByConfiguration[configuration] ?? [];
  const step = STEPS.indexOf(current);
  const config = product.configurations.find((c) => c.code === configuration)!;
  const styleOpt = product.styles.find((s) => s.code === style)!;
  const gradeOpt = product.grades.find((g) => g.code === grade)!;
  const widthIn = widthText ? parseInches(widthText) : undefined;
  const heightIn = heightText ? parseInches(heightText) : undefined;
  const sizeEntered = widthIn !== undefined && heightIn !== undefined;
  const badSize = (widthText !== "" && widthIn === undefined) || (heightText !== "" && heightIn === undefined);
  const pair = config.leaves > 1;
  const resolved = resolveAddons(offers, addonState);

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
  const needsQuote = sizeEntered && !quote.ok && quote.reason === "quote";

  function go(next: StepKey) {
    setCurrent(next);
    setMoved(true);
    setFurthest((f) => Math.max(f, STEPS.indexOf(next)));
    setShowQuote(false);
  }
  /** After picking type or style: the next step, or straight back to the last screen if they'd been there. */
  const advance = (from: StepKey) => go(furthest >= 2 ? "build" : STEPS[STEPS.indexOf(from) + 1]!);

  const quoteDetails = () =>
    `${config.name}, ${gradeOpt.name}, ${styleOpt.name}${
      widthText || heightText ? `, opening ${widthText || "?"} × ${heightText || "?"} in` : ""
    }, qty ${quantity}`;

  const runningPrice = quote.ok ? quote.unitPrice + resolved.chosen.reduce((a, x) => a + x.price, 0) : undefined;

  let panel = null;
  if (current === "type") {
    panel = (
      <div className="options">
        {product.configurations.map((c) => (
          <OptionCard key={c.code} image={c.image} selected={furthest > 0 && configuration === c.code}
            title={c.name} detail={`from ${usd(c.basePrice)}`} note={c.leaves > 1 ? `${c.leaves} doors` : undefined}
            onClick={() => {
              if (c.code !== configuration) setAddonState({}); // single and double add-ons differ
              setConfiguration(c.code);
              if (isExcluded(c.code, style, grade)) {
                const ok = product.styles.find((s) => !isExcluded(c.code, s.code, grade));
                if (ok) setStyle(ok.code);
              }
              advance("type");
            }} />
        ))}
      </div>
    );
  } else if (current === "style") {
    panel = (
      <div className="options">
        {product.styles.map((s) => {
          const disabled = isExcluded(configuration, s.code, grade);
          return (
            <OptionCard key={s.code} image={s.image} selected={furthest > 1 && style === s.code} disabled={disabled}
              title={s.name} detail={disabled ? `Not available as a ${config.name.toLowerCase()}` : signed(s.adder * config.leaves)}
              onClick={() => {
                setStyle(s.code);
                advance("style");
              }} />
          );
        })}
      </div>
    );
  } else {
    panel = (
      <>
        <fieldset className="opt-group">
          <legend>Wood: <span className="opt-current">{gradeOpt.name}</span></legend>
          <div className="swatches">
            {product.grades.map((g) => (
              <button key={g.code} type="button" className="swatch" aria-pressed={grade === g.code}
                disabled={isExcluded(configuration, style, g.code)} onClick={() => setGrade(g.code)}>
                {g.image && <img src={g.image} alt="" loading="lazy" />}
                <span className="swatch-name">{g.name}</span>
                <span className="swatch-price">{signed(g.adder * config.leaves)}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="opt-group">
          <legend>
            Opening size <Link href="/measure" target="_blank" className="legend-link">How to measure</Link>
          </legend>
          <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.92rem" }}>
            Measure inside the door frame.{pair ? " Enter the full width; we split it between the two doors." : ""}
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
                value={heightText} onChange={(e) => setHeightText(e.target.value)} />
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
        </fieldset>

        {offers.length > 0 && (
          <fieldset className="opt-group">
            <legend>Add-ons <span className="opt-current">(optional)</span></legend>
            <AddonsStep offers={offers} state={addonState} onChange={setAddonState} />
          </fieldset>
        )}

        {needsQuote ? (
          <QuoteForm productTitle={product.title} details={quoteDetails()} />
        ) : quote.ok && sizeEntered && resolved.complete ? (
          <>
            <AddToCart
              lines={quote.lines}
              addons={resolved.chosen}
              quantity={quantity}
              onQuantity={setQuantity}
              unit={pair ? ["set this size", "sets this size"] : ["door this size", "doors this size"]}
              note={`Sold unfinished. Hardware and tracks not included.${
                product.leadTimeWeeks ? ` Ready in about ${product.leadTimeWeeks.min}–${product.leadTimeWeeks.max} weeks.` : ""
              }`}
              shippingNote={shippingNote}
              item={{
                handle: product.handle,
                door: { configuration, grade, style, widthIn: widthIn!, heightIn: heightIn! },
                addons: resolved.chosen.map((a) => ({ key: a.key, sku: a.sku })),
              }}
            />
            <p style={{ marginTop: 12 }}>
              <button type="button" className="btn secondary block" onClick={() => setShowQuote((v) => !v)}>
                {showQuote ? "Hide quote request" : "Need something changed? Request a quote"}
              </button>
            </p>
            {showQuote && <QuoteForm productTitle={product.title} details={quoteDetails()} />}
          </>
        ) : (
          <div className="summary">
            <button type="button" className="btn block" disabled>
              {!sizeEntered || badSize ? "Enter your opening size" : !resolved.complete ? "Finish your add-on choices" : "Add to cart"}
            </button>
          </div>
        )}
      </>
    );
  }

  const answers: Record<StepKey, string> = { type: config.name, style: styleOpt.name, build: "" };

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

        <Progress steps={STEPS.map((k) => LABELS[k])} current={step} furthest={furthest} />

        {STEPS.map((key, i) => {
          if (key === current) {
            return (
              <StepPanel key={key} index={i} total={STEPS.length} takeFocus={moved}
                heading={key === "build" ? "Wood, size & add-ons" : `Choose your ${LABELS[key].toLowerCase()}`}
                onBack={key === "style" ? () => go("type") : undefined}>
                {panel}
              </StepPanel>
            );
          }
          if (i <= furthest && answers[key]) {
            return <DoneRow key={key} label={LABELS[key]} value={answers[key]} onChange={() => go(key)} />;
          }
          return <TodoRow key={key} label={LABELS[key]} />;
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
