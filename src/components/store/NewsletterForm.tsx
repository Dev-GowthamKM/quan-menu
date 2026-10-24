"use client";
import { useState } from "react";
import { subscribeNewsletter } from "@/server/account";
import { cx } from "../ui/controls";
import { ArrowRight } from "../ui/icons";

/** dark: on a brand-coloured band, such as the footer. boxed: a bordered field with a filled button. */
export default function NewsletterForm({ source = "footer", dark, boxed }: { source?: string; dark?: boolean; boxed?: boolean }) {
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
      <div
        className={cx(
          "flex",
          boxed ? "gap-1 rounded-btn border-2 p-1" : "border-b",
          dark ? "border-on-brand/60" : boxed ? "border-ink bg-field" : "border-ink",
        )}
      >
        <input
          id={`newsletter-${source}`}
          type="email"
          required
          autoComplete="email"
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cx("min-w-0 flex-1 bg-transparent text-sm outline-none", boxed ? "h-10 px-3" : "h-12", dark ? "placeholder:text-on-brand-soft" : "placeholder:text-stone")}
        />
        <button
          type="submit"
          disabled={state.busy}
          className={cx(
            "inline-flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase disabled:opacity-50",
            boxed && "rounded-btn px-4 font-semibold",
            boxed && (dark ? "bg-on-brand text-brand" : "bg-brand text-on-brand"),
          )}
        >
          Subscribe <ArrowRight size={16} />
        </button>
      </div>
      <p aria-live="polite" className={cx("mt-2 min-h-5 text-xs", dark ? (state.error ? "font-medium text-on-brand" : "text-on-brand-soft") : state.error ? "text-sale" : "text-taupe")}>
        {state.text}
      </p>
    </form>
  );
}
