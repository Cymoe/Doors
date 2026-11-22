import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/catalog";

const body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(4000).optional().default(""),
  product: z.string().max(200).optional().default(""),
  company: z.string().optional().default(""), // spam trap
});

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Emails a quote request to contact.email in catalog/store.yaml via Resend. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter your name and a valid email." }, { status: 400 });
  }
  const q = parsed.data;
  if (q.company) return NextResponse.json({ ok: true }); // a bot filled the hidden field

  const subject = `Quote request: ${q.product || "custom work"} (${q.name})`;
  const text = [
    `Name: ${q.name}`,
    `Email: ${q.email}`,
    `Phone: ${q.phone || "-"}`,
    `Product: ${q.product || "-"}`,
    "",
    q.message,
  ].join("\n");

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[quote request; email not configured]\n${subject}\n${text}`);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: `Quote requests aren't set up yet. Please email ${store.contact.email}.` },
      { status: 503 },
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [store.contact.email],
      reply_to: q.email,
      subject,
      text,
      html: `<pre style="font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return NextResponse.json({ error: `Couldn't send. Please email ${store.contact.email}.` }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
