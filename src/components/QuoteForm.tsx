"use client";

import { useState, type FormEvent } from "react";

interface Props {
  productTitle: string;
  /** The current builder selection, pre-filled so the customer doesn't retype it. */
  details: string;
}

export function QuoteForm({ productTitle, details }: Props) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, product: productTitle }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't send. Please try again.");
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  if (state === "sent") {
    return <p className="notice ok">Thanks, we got your request and will get back to you with a quote soon.</p>;
  }

  return (
    <form className="summary" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <h3 style={{ margin: 0 }}>Request a quote</h3>
      <div className="fields">
        <label className="field">
          Name
          <input name="name" required autoComplete="name" maxLength={120} />
        </label>
        <label className="field">
          Phone
          <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
        </label>
      </div>
      <label className="field">
        Email
        <input name="email" type="email" required autoComplete="email" maxLength={200} />
      </label>
      <label className="field">
        What you need
        <textarea name="message" rows={4} maxLength={4000} defaultValue={`${details}\n\n`} />
      </label>
      {/* Spam trap: hidden from people, filled in by bots. */}
      <label className="honeypot" aria-hidden="true">
        Company <input name="company" tabIndex={-1} autoComplete="off" />
      </label>
      <button className="btn" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send request"}
      </button>
      {state === "error" && <p className="notice error">{error}</p>}
    </form>
  );
}
