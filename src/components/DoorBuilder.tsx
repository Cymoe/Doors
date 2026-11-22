"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AddonOffer } from "@/cart";
import type { DoorProduct } from "@/schema";
import { formatInches, parseInches, quoteDoor, usd } from "@/pricing";
import { QuoteForm } from "./QuoteForm";
import { Description } from "./Description";
import {
  AddToCart,
  AddonsStep,
  DoneRow,
  Progress,
  StepNav,
  StepPanel,
  TodoRow,
  resolveAddons,
  type AddonState,
} from "./steps";

interface Props {
  product: DoorProduct;
  /** Add-ons offered for each configuration code. */
  addonsByConfiguration: Record<string, AddonOffer[]>;
  shippingNote?: string;
}

type StepKey = "type" | "style" | "wood" | "size" | "addons" | "review";
const LABELS: Record<StepKey, string> = {
  type: "Door type",
  style: "Style",
  wood: "Wood",
  size: "Opening size",
  addons: "Add-ons",
  review: "Review",
};

const signed = (n: number) => (n > 0 ? `+${usd(n)}` : n < 0 ? `−${usd(-n)}` : "Included");

/** The custom door, built to the customer's opening, chosen one step at a time. */
export function DoorBuilder({ product, addonsByConfiguration, shippingNote }: Props) {
  const [configuration, setConfiguration] = useState(product.configurations[0]!.code);
  const [style, setStyle] = useState(product.styles[0]!.code);
  const [grade, setGrade] = useState(product.grades[0]!.code);
  const [widthText, setWidthText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [addonState, setAddonState] = useState<AddonState>({});
  const [quantity, setQuantity] = useState(1);
  const [showQuote, setShowQuote] = useState(false);

  const offers = addonsByConfiguration[configuration] ?? [];
  const steps: StepKey[] = ["type", "style", "wood", "size", ...(offers.length ? (["addons"] as const) : []), "review"];
  const [current, setCurrent] = useState<StepKey>("type");
  const [furthestKey, setFurthestKey] = useState<StepKey>("type");
  const order: StepKey[] = ["type", "style", "wood", "size", "addons", "review"];
  const rank = (k: StepKey) => order.indexOf(k);
  const step = steps.indexOf(current);
  // The furthest step reached, mapped onto this configuration's steps (add-ons may come and go).
  const furthest = Math.max(...steps.map((k, i) => (rank(k) <= rank(furthestKey) ? i : 0)));

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
    setFurthestKey((f) => (rank(next) > rank(f) ? next : f));
    setShowQuote(false);
  }
  /** After a pick, move on: to the next step, or back to where the customer was if they came to change something. */
  function advance(from: StepKey, nextSteps: StepKey[] = steps) {
    const after = nextSteps[nextSteps.indexOf(from) + 1]!;
    const back = nextSteps.filter((k) => rank(k) <= rank(furthestKey)).pop()!;
    go(rank(back) > rank(after) ? back : after);
  }

  const quoteDetails = () =>
    `${config.name}, ${gradeOpt.name}, ${styleOpt.name}${
      widthText || heightText ? `, opening ${widthText || "?"} × ${heightText || "?"} in` : ""
    }, qty ${quantity}`;

  const answers: Partial<Record<StepKey, string>> = {
    type: config.name,
    style: styleOpt.name,
    wood: gradeOpt.name,
    size: sizeEntered ? `${formatInches(widthIn!)} wide × ${formatInches(heightIn!)} tall` : "",
    addons: resolved.chosen.map((a) => a.label).join(", ") || "None",
  };

  let panel: ReactNode;
  switch (current) {
    case "type":
      panel = (
        <div className="options">
          {product.configurations.map((c) => (
            <OptionCard key={c.code} image={c.image} selected={rank(furthestKey) > 0 && configuration === c.code}
              title={c.name} detail={`from ${usd(c.basePrice)}`} note={c.leaves > 1 ? `${c.leaves} doors` : undefined}
              onClick={() => {
                if (c.code !== configuration) setAddonState({}); // single and pair add-ons differ
                setConfiguration(c.code);
                if (isExcluded(c.code, style, grade)) {
                  const ok = product.styles.find((s) => !isExcluded(c.code, s.code, grade));
                  if (ok) setStyle(ok.code);
                }
                const nextOffers = addonsByConfiguration[c.code] ?? [];
                advance("type", ["type", "style", "wood", "size", ...(nextOffers.length ? (["addons"] as const) : []), "review"]);
              }} />
          ))}
        </div>
      );
      break;
    case "style":
      panel = (
        <div className="options">
          {product.styles.map((s) => {
            const disabled = isExcluded(configuration, s.code, grade);
            return (
              <OptionCard key={s.code} image={s.image} selected={rank(furthestKey) > 1 && style === s.code} disabled={disabled}
                title={s.name} detail={disabled ? `Not available as a ${config.name.toLowerCase()}` : signed(s.adder * config.leaves)}
                onClick={() => {
                  setStyle(s.code);
                  advance("style");
                }} />
            );
          })}
        </div>
      );
      break;
    case "wood":
      panel = (
        <div className="options">
          {product.grades.map((g) => (
            <OptionCard key={g.code} image={g.image} selected={rank(furthestKey) > 2 && grade === g.code}
              disabled={isExcluded(configuration, style, g.code)} title={g.name} detail={signed(g.adder * config.leaves)}
              note={g.note}
              onClick={() => {
                setGrade(g.code);
                advance("wood");
              }} />
          ))}
        </div>
      );
      break;
    case "size": {
      const next = steps[steps.indexOf("size") + 1]!;
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
                onKeyDown={(e) => e.key === "Enter" && quote.ok && sizeEntered && go(next)} />
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
            <StepNav onBack={() => go("wood")} onNext={() => go(next)} nextDisabled={!sizeEntered || badSize || !quote.ok} />
          )}
        </>
      );
      break;
    }
    case "addons":
      panel = (
        <>
          <p className="muted">Optional. Skip this step if you don&apos;t need any.</p>
          <AddonsStep offers={offers} state={addonState} onChange={setAddonState} />
          <div className="step-nav">
            <button type="button" className="btn secondary" onClick={() => go("size")}>Back</button>
            <button type="button" className="btn" disabled={!resolved.complete} onClick={() => go("review")}>
              {resolved.chosen.length ? "Continue" : "No add-ons, continue"}
            </button>
          </div>
        </>
      );
      break;
    case "review":
      panel =
        quote.ok && sizeEntered ? (
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
          <>
            <p className="notice">{sizeEntered && !quote.ok ? quote.message : "Enter your opening size first."}</p>
            <StepNav onNext={() => go("size")} nextLabel="Fix the size" />
          </>
        );
      break;
  }

  const runningPrice = quote.ok ? quote.unitPrice + resolved.chosen.reduce((a, x) => a + x.price, 0) : undefined;

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

        <Progress steps={steps.map((k) => LABELS[k])} current={step} furthest={furthest} />

        {steps.map((key, i) => {
          const label = LABELS[key];
          if (key === current) {
            return (
              <StepPanel key={key} index={i} total={steps.length}
                heading={key === "review" ? "Review and add to cart" : key === "addons" ? "Add-ons" : `Choose your ${label.toLowerCase()}`}
                onBack={i > 0 && ["style", "wood", "review"].includes(key) ? () => go(steps[i - 1]!) : undefined}>
                {panel}
              </StepPanel>
            );
          }
          if (i <= furthest && key !== "review" && answers[key]) {
            return <DoneRow key={key} label={label} value={answers[key]!} onChange={() => go(key)} />;
          }
          return <TodoRow key={key} label={label} />;
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
