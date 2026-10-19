"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { confirmStripeReturn, orderStatus, reportPaymentFailure, retryPayment, verifyRazorpayPayment } from "@/server/checkout";
import { formatDateTime } from "@/lib/format";
import { Button, Notice, Spinner } from "../../ui/controls";
import { openRazorpay } from "../checkout/razorpay-client";

/**
 * Shown while an order waits for payment. It never decides on its own that a payment
 * succeeded: it asks the server (which asks the payment provider) and refreshes when
 * the order's status actually changes.
 */
export default function PaymentWatcher({
  orderNumber,
  accessKey,
  paymentStatus,
  expiresAt,
  stripeSession,
}: {
  orderNumber: string;
  accessKey: string | null;
  paymentStatus: string;
  expiresAt: string | null;
  stripeSession: string | null;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const polls = useRef(0);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (stripeSession && accessKey) await confirmStripeReturn(orderNumber, accessKey, stripeSession);
      while (!stop && polls.current < 40) {
        const s = await orderStatus(orderNumber, accessKey);
        if (!s || s.status !== "pending_payment" || s.payment_status !== paymentStatus) {
          router.refresh();
          return;
        }
        polls.current++;
        await new Promise((r) => setTimeout(r, 3000));
      }
      setChecking(false);
    })();
    return () => {
      stop = true;
    };
  }, [orderNumber, accessKey, paymentStatus, stripeSession, router]);

  const pay = async () => {
    setBusy(true);
    setError(null);
    const res = await retryPayment(orderNumber, accessKey);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    const next = res.data;
    if (next.type === "stripe") return window.location.assign(next.url);
    if (next.type !== "razorpay") return router.refresh();
    const key = new URL(next.orderUrl, window.location.origin).searchParams.get("key") ?? accessKey ?? "";
    await openRazorpay({
      session: next.session,
      storeName: document.title.split("|").pop()?.trim() || "Store",
      orderNumber,
      prefill: next.prefill,
      timeoutSeconds: 900,
      onSuccess: async (r) => {
        setChecking(true);
        await verifyRazorpayPayment({ orderNumber, key, ...r });
        router.refresh();
      },
      onFailure: (r) => {
        reportPaymentFailure(orderNumber, key, r.error?.metadata?.payment_id ?? null);
        setError(r.error?.description || "The payment didn't go through.");
      },
      onDismiss: () => undefined,
    }).catch((e: Error) => setError(e.message));
  };

  return (
    <div className="mb-10 border border-amber-200 bg-amber-50 px-6 py-6">
      <h1 className="font-serif text-3xl">{paymentStatus === "failed" ? "Your payment didn't go through" : "Waiting for your payment"}</h1>
      <p className="mt-2 text-sm text-amber-900">
        {paymentStatus === "failed"
          ? "No money was taken for the failed attempt. Your items are still reserved, so you can try again."
          : "If you've just paid, we're confirming it with the payment provider. This page updates by itself."}
        {expiresAt && <> Items are reserved until {formatDateTime(expiresAt)}.</>}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button onClick={pay} busy={busy}>Pay now</Button>
        {checking && (
          <span className="inline-flex items-center gap-2 text-sm text-amber-900"><Spinner className="size-4" /> Checking payment status…</span>
        )}
      </div>
      {error && <Notice tone="error" className="mt-4">{error}</Notice>}
    </div>
  );
}
