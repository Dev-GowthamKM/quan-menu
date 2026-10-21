"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { setPriceAlerts } from "@/server/reminders";

/** Wishlist page: price-drop emails on or off. */
export default function PriceAlertsToggle({ initial, hasEmail = true }: { initial: boolean; hasEmail?: boolean }) {
  const [on, setOn] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!hasEmail) {
    return (
      <p className="mt-4 border border-line bg-paper px-4 py-3 text-sm text-taupe">
        Want an email when something here drops in price? <Link href="/account" className="text-ink underline underline-offset-4">Add an email address</Link> to your account first.
      </p>
    );
  }
  return (
    <div className="mt-4 border border-line bg-paper px-4 py-3 text-sm">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            start(async () => {
              const res = await setPriceAlerts(next);
              if (!res.ok) setOn(!next);
              setMessage(res.ok ? res.message ?? null : res.error);
            });
          }}
          className="mt-0.5 size-4 accent-ink"
        />
        <span>Email me when something on my wishlist drops in price <span className="block text-xs text-taupe">At most one email every few days. Unsubscribe from any of them.</span></span>
      </label>
      {message && <p className="mt-2 text-xs text-taupe" role="status">{message}</p>}
    </div>
  );
}
