import type { Metadata } from "next";
import Link from "next/link";
import { liveProducts } from "@/catalog";

export const metadata: Metadata = {
  title: "How to measure",
  description: "How to measure a door opening for a custom-built door.",
};

export default function Measure() {
  const door = liveProducts().find((p) => p.type === "door");
  return (
    <div className="wrap prose" style={{ padding: "40px 16px" }}>
      <p className="eyebrow">Before you order</p>
      <h1>How to measure your opening</h1>
      <p className="muted">
        We build every door to the size you give us, so measure carefully. Use a steel tape and measure in inches,
        to the nearest 1/8&quot;.
      </p>

      <h2>Replacing a door in an existing frame</h2>
      <ol>
        <li>
          <strong>Width:</strong> measure inside the frame, jamb to jamb, at the top, middle and bottom. Use the
          smallest number.
        </li>
        <li>
          <strong>Height:</strong> measure from the floor to the underside of the top jamb, on the left and right.
          Use the smallest number.
        </li>
        <li>Tell us the opening size. We size the door for the gaps around it, so don&apos;t subtract anything.</li>
      </ol>

      <h2>Double doors and bifolds</h2>
      <p>Enter the full opening width. We split it between the two doors.</p>

      <h2>Barn doors</h2>
      <p>
        Measure the opening the door will cover. A barn door hangs on the wall and should overlap the opening, so we
        build it a little bigger than the opening. Track hardware isn&apos;t included.
      </p>

      <h2>Pocket doors</h2>
      <p>Measure the finished opening. The pocket frame kit isn&apos;t included.</p>

      <h2>Not sure?</h2>
      <p>
        Odd openings, out-of-square frames or new construction: send us your measurements with a quote request and
        we&apos;ll help.
      </p>
      {door && (
        <p>
          <Link className="btn" href={`/products/${door.handle}`}>Back to the door builder</Link>
        </p>
      )}
    </div>
  );
}
