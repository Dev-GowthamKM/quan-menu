"use client";
import { useState } from "react";
import { subscribeNewsletter } from "@/server/account";
import { cx } from "../ui/controls";
import { ArrowRight } from "../ui/icons";

export default function NewsletterForm({ source = "footer", dark }: { source?: string; dark?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ busy?: boolean; text?: string; error?: boolean }>({});

  return (
    <form
      className="mt-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ busy: true });
        const res = await subscribeNewsletter(email, source);
        setState(res.ok ? { text: res.message } : { text: res.error, error: true });
        if (res.ok) setEmail("");
      }}
    >
      <label htmlFor={`newsletter-${source}`} className="sr-only">Email address</label>
      <div className={cx("flex border-b", dark ? "border-ivory/60" : "border-ink")}>
        <input
          id={`newsletter-${source}`}
          type="email"
          required
          autoComplete="email"
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cx("h-12 min-w-0 flex-1 bg-transparent text-sm outline-none", dark ? "placeholder:text-ivory/60" : "placeholder:text-stone")}
        />
        <button type="submit" disabled={state.busy} className="inline-flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase disabled:opacity-50">
          Subscribe <ArrowRight size={16} />
        </button>
      </div>
      <p aria-live="polite" className={cx("mt-2 min-h-5 text-xs", state.error ? "text-sale" : dark ? "text-ivory/80" : "text-taupe")}>
        {state.text}
      </p>
    </form>
  );
}
