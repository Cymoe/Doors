import Link from "next/link";
import { liveProducts, store } from "@/catalog";
import { usd } from "@/pricing";
import { DoorPreview } from "@/components/DoorPreview";

export default function Home() {
  const doors = liveProducts().filter((p) => p.type === "door");

  return (
    <>
      <div className="wrap">
        <section className="hero">
          <div>
            <p className="eyebrow">Handbuilt in Midland/Odessa</p>
            <h1>Solid wood doors, built to your exact opening.</h1>
            <p className="lead">
              Clear or knotty pine, in the style you want, sized to the inch. Choose your door, enter your
              measurements, and see your price right away.
            </p>
            {doors[0] && (
              <Link className="btn" href={`/doors/${doors[0].handle}`}>
                Build your door
              </Link>
            )}
          </div>
          <div className="art" aria-hidden="true">
            <DoorPreview style="2PSQ" grade="CLR" configuration="SGL" leaves={1} />
            <DoorPreview style="SHK" grade="KNT" configuration="SGL" leaves={1} />
            <DoorPreview style="GLS" grade="CLR" configuration="SGL" leaves={1} />
          </div>
        </section>

        <section className="section" id="doors">
          <h2>Doors</h2>
          <div className="cards">
            {doors.map((d) => {
              const from = Math.min(...d.configurations.map((c) => c.basePrice));
              return (
                <Link key={d.handle} href={`/doors/${d.handle}`} className="card">
                  <h3>{d.title}</h3>
                  <p className="muted" style={{ margin: 0 }}>
                    {d.configurations.map((c) => c.name).join(" · ")}
                  </p>
                  <p className="muted" style={{ margin: 0 }}>{d.styles.length} styles · {d.grades.map((g) => g.name).join(" or ")}</p>
                  <p className="price" style={{ margin: 0 }}>From {usd(from)}</p>
                  {d.status === "draft" && <p className="muted" style={{ margin: 0 }}>Draft: not shown on the live site</p>}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="section">
          <h2>How it works</h2>
          <ol className="steps">
            <li>
              <h3>Design it</h3>
              <p className="muted">Pick the door type, style and wood. The price updates as you go.</p>
            </li>
            <li>
              <h3>Measure</h3>
              <p className="muted">
                Enter your opening width and height. <Link href="/measure">Here&apos;s how.</Link>
              </p>
            </li>
            <li>
              <h3>Order</h3>
              <p className="muted">
                {store.depositPercent < 100
                  ? `Pay a ${store.depositPercent}% deposit online; the rest is due when it's ready.`
                  : "Pay securely online."}
              </p>
            </li>
            <li>
              <h3>Pick up or delivery</h3>
              <p className="muted">
                {[
                  store.pickup.enabled ? `Pick up at ${store.pickup.location.replace(/^Our/, "our")}` : null,
                  store.localDelivery.enabled ? `delivery in ${store.localDelivery.area}` : null,
                ]
                  .filter(Boolean)
                  .join(", or ")}
                .
              </p>
            </li>
          </ol>
        </section>

        <section className="section compare">
          <div>
            <h2>Not a big box door</h2>
            <p className="muted">
              Hollow-core doors are cardboard honeycomb between two thin skins. Ours are solid pine: heavier,
              quieter, and they take stain and paint like real wood because they are.
            </p>
          </div>
          <div>
            <h2>Something different?</h2>
            <p className="muted">
              Odd sizes, matching sets for a whole house, or a style you don&apos;t see here: start in the door
              builder and use &ldquo;Request a quote&rdquo;, or email{" "}
              <a href={`mailto:${store.contact.email}`}>{store.contact.email}</a>.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
