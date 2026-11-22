import Link from "next/link";
import { cardInfo, liveCategories } from "@/catalog";
import type { Category, Product } from "@/schema";
import { usd } from "@/pricing";

/** Category links shown above the grid. */
export function CategoryNav({ current }: { current?: Category }) {
  return (
    <nav className="cat-nav" aria-label="Categories">
      <Link href="/" aria-current={current ? undefined : "page"}>All</Link>
      {liveCategories().map((c) => (
        <Link key={c.key} href={`/c/${c.key}`} aria-current={current === c.key ? "page" : undefined}>
          {c.name}
        </Link>
      ))}
    </nav>
  );
}

export function CatalogGrid({ products }: { products: Product[] }) {
  return (
    <ul className="grid">
      {products.map((p, i) => {
        const c = cardInfo(p);
        return (
          <li key={p.handle}>
            <Link href={`/products/${p.handle}`} className="tile">
              <span className="tile-photo">
                {c.image && (
                  <img src={c.image.src} alt={c.image.alt} loading={i < 8 ? "eager" : "lazy"} />
                )}
                {c.maxPercentOff && <span className="badge">Up to {c.maxPercentOff}% off</span>}
                {p.type === "door" && <span className="badge custom">Custom built</span>}
              </span>
              <span className="tile-title">{c.title}</span>
              {c.note && <span className="tile-note">{c.note}</span>}
              <span className="tile-price">
                <span className="from">From</span>
                {c.fromCompareAt && <s className="was">{usd(c.fromCompareAt)}</s>}
                <strong>{usd(c.fromPrice)}</strong>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
