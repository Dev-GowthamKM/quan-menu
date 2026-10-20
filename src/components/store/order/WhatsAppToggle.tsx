"use client";
import { useState, useTransition } from "react";
import { setWhatsappUpdates } from "@/server/orders";

/** WhatsApp order updates on or off, on the customer's order page. */
export default function WhatsAppToggle({ orderNumber, accessKey, initial }: { orderNumber: string; accessKey: string | null; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const flip = () =>
    start(async () => {
      const res = await setWhatsappUpdates(orderNumber, accessKey, !on);
      if (!res.ok) return setMessage(res.error);
      setOn(!on);
      setMessage(null);
    });
  return (
    <p className="text-sm text-taupe" aria-live="polite">
      {on ? "Order updates are sent to you on WhatsApp." : "WhatsApp updates are off for this order."}{" "}
      <button type="button" onClick={flip} disabled={pending} className="text-ink underline underline-offset-4 disabled:opacity-50">
        {on ? "Turn off" : "Turn on"}
      </button>
      {message && <span className="block text-sale">{message}</span>}
    </p>
  );
}
