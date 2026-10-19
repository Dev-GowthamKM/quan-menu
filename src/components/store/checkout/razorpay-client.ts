"use client";
import type { RazorpaySession } from "@/lib/payments/service";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: (r: RazorpayFailure) => void): void };
  }
}

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailure {
  error: { code: string; description: string; reason?: string; metadata?: { payment_id?: string; order_id?: string } };
}

let loading: Promise<void> | null = null;

/** Loads Razorpay's hosted Checkout script once. */
export function loadRazorpay(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export type UiMethod = "upi" | "card" | "netbanking" | "wallet";

/** Opens Razorpay Checkout with the customer's preferred method shown first. */
export async function openRazorpay(opts: {
  session: RazorpaySession;
  storeName: string;
  orderNumber: string;
  prefill: { name: string; email: string; contact: string };
  method?: UiMethod;
  timeoutSeconds: number;
  onSuccess: (r: RazorpaySuccess) => void;
  onFailure: (r: RazorpayFailure) => void;
  onDismiss: () => void;
}) {
  await loadRazorpay();
  const labels: Record<UiMethod, string> = { upi: "UPI", card: "Cards", netbanking: "Net banking", wallet: "Wallets" };
  const rzp = new window.Razorpay!({
    key: opts.session.keyId,
    amount: opts.session.amount,
    currency: opts.session.currency,
    order_id: opts.session.razorpayOrderId,
    name: opts.storeName,
    description: `Order ${opts.orderNumber}`,
    prefill: opts.prefill,
    notes: { order_number: opts.orderNumber },
    theme: { color: "#111111" },
    timeout: opts.timeoutSeconds,
    retry: { enabled: true },
    config: opts.method
      ? {
          display: {
            blocks: { preferred: { name: `Pay using ${labels[opts.method]}`, instruments: [{ method: opts.method }] } },
            sequence: ["block.preferred"],
            preferences: { show_default_blocks: true },
          },
        }
      : undefined,
    modal: { ondismiss: opts.onDismiss, confirm_close: true, escape: true },
    handler: opts.onSuccess,
  });
  rzp.on("payment.failed", opts.onFailure);
  rzp.open();
}
