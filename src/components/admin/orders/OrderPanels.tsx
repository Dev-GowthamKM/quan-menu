"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addOrderNote, cancelOrderAdmin, markCodCollected, refundOrder, setFulfillment, updateReturnRequest } from "@/server/admin/orders";
import { formatDateTime } from "@/lib/format";
import { formatMoney, fromMinor, toMinor } from "@/lib/money";
import type { FulfillmentStatus, OrderStatus, PaymentStatus } from "@/lib/types";
import { Badge, Button, cx } from "../../ui/controls";
import { CheckIcon, ExternalIcon } from "../../ui/icons";
import { useToast } from "../Toaster";
import { adminInput, Card } from "../ui";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Runs an action, shows the outcome and refreshes the page data. */
function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error, "error");
      toast(res.message ?? "Done.");
      after?.();
      router.refresh();
    });
  return { pending, run };
}

const STEPS: { key: FulfillmentStatus; label: string }[] = [
  { key: "unfulfilled", label: "Received" },
  { key: "processing", label: "Preparing" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

export function FulfillmentPanel({ orderId, orderNumber, status, fulfillment, providers, shipment }: {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillment: FulfillmentStatus;
  providers: { name: string; tracking_url_template: string }[];
  shipment: { carrier: string; tracking_number: string; tracking_url: string; shipped_at: string | null; delivered_at: string | null } | null;
}) {
  const { pending, run } = useAction();
  const [ship, setShip] = useState(false);
  const [form, setForm] = useState({ carrier: shipment?.carrier || providers[0]?.name || "", other: "", tracking: shipment?.tracking_number ?? "", url: "", notify: true });
  const current = STEPS.findIndex((s) => s.key === fulfillment);
  const open = status === "confirmed" || status === "completed";
  const go = (next: "processing" | "packed" | "shipped" | "delivered" | "returned", extra: Partial<Parameters<typeof setFulfillment>[0]> = {}) =>
    run(() => setFulfillment({ orderId, orderNumber, status: next, ...extra }), () => setShip(false));

  return (
    <Card title="Fulfilment">
      {fulfillment === "returned" ? (
        <p className="text-sm">All items have been returned.</p>
      ) : (
        <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Fulfilment progress">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1">
              <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1", i < current ? "bg-emerald-50 text-emerald-800" : i === current ? "bg-ink text-white" : "bg-black/5 text-stone")} aria-current={i === current ? "step" : undefined}>
                {i < current && <CheckIcon size={11} />}{s.label}
              </span>
              {i < STEPS.length - 1 && <span className="h-px w-3 bg-black/15" />}
            </li>
          ))}
        </ol>
      )}

      {shipment && (shipment.carrier || shipment.tracking_number) && (
        <p className="mt-3 text-sm">
          {shipment.carrier} {shipment.tracking_number && <>· <span className="font-mono">{shipment.tracking_number}</span></>}
          {shipment.tracking_url && <a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs underline">Track <ExternalIcon size={11} /></a>}
          {shipment.shipped_at && <span className="block text-xs text-stone">Shipped {formatDateTime(shipment.shipped_at)}{shipment.delivered_at && ` · delivered ${formatDateTime(shipment.delivered_at)}`}</span>}
        </p>
      )}

      {!open ? (
        <p className="mt-3 text-sm text-taupe">{status === "pending_payment" ? "Fulfilment starts once the payment is confirmed." : "This order was cancelled."}</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {fulfillment === "unfulfilled" && <Button size="sm" variant="secondary" busy={pending} onClick={() => go("processing")}>Start preparing</Button>}
          {(fulfillment === "unfulfilled" || fulfillment === "processing") && <Button size="sm" variant="secondary" busy={pending} onClick={() => go("packed")}>Mark packed</Button>}
          {["unfulfilled", "processing", "packed"].includes(fulfillment) && <Button size="sm" busy={pending} onClick={() => setShip(true)}>Mark shipped…</Button>}
          {fulfillment === "shipped" && (
            <>
              <Button size="sm" busy={pending} onClick={() => go("delivered")}>Mark delivered</Button>
              <Button size="sm" variant="ghost" onClick={() => setShip(true)}>Edit tracking</Button>
            </>
          )}
          {(fulfillment === "shipped" || fulfillment === "delivered") && (
            <Button size="sm" variant="ghost" busy={pending} onClick={() => window.confirm("Mark the whole order as returned to you? Use the return requests below for partial returns.") && go("returned", { notify: false })}>Mark returned</Button>
          )}
        </div>
      )}

      {ship && (
        <form
          className="mt-4 grid gap-3 rounded-md border border-black/10 bg-black/[0.02] p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const carrier = form.carrier === "__other" ? form.other.trim() : form.carrier;
            if (!carrier) return;
            go("shipped", { carrier, trackingNumber: form.tracking.trim(), trackingUrl: form.url.trim(), notify: form.notify });
          }}
        >
          <label className="grid gap-1 text-xs font-medium text-taupe">
            Courier
            <select value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} className={adminInput}>
              {providers.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              <option value="__other">Other…</option>
            </select>
          </label>
          {form.carrier === "__other" && (
            <label className="grid gap-1 text-xs font-medium text-taupe">Courier name<input value={form.other} onChange={(e) => setForm({ ...form, other: e.target.value })} maxLength={80} className={adminInput} required /></label>
          )}
          <label className="grid gap-1 text-xs font-medium text-taupe">Tracking number<input value={form.tracking} onChange={(e) => setForm({ ...form, tracking: e.target.value })} maxLength={80} className={cx(adminInput, "font-mono")} /></label>
          <label className="grid gap-1 text-xs font-medium text-taupe sm:col-span-2">
            Tracking link (optional)
            <input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="Filled in automatically for known couriers" className={adminInput} />
          </label>
          <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} className="size-4 accent-ink" /> Email the customer the tracking details
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" busy={pending}>Save shipment</Button>
            <Button size="sm" variant="ghost" onClick={() => setShip(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export function NotePanel({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const { pending, run } = useAction();
  const [note, setNote] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim()) run(() => addOrderNote(orderId, orderNumber, note), () => setNote(""));
      }}
      className="flex gap-2"
    >
      <label htmlFor="order-note" className="sr-only">Internal note</label>
      <input id="order-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Add an internal note (customers don't see these)" className={cx(adminInput, "flex-1")} />
      <Button type="submit" size="sm" variant="secondary" busy={pending} disabled={!note.trim()}>Add note</Button>
    </form>
  );
}

interface PaymentRow {
  id: string; provider: string; provider_order_id: string | null; provider_payment_id: string | null; amount: number; amount_refunded: number;
  status: string; method: string | null; error_description: string | null; captured_at: string | null; created_at: string;
}
interface RefundRow { id: string; amount: number; status: string; reason: string; error: string | null; provider_refund_id: string | null; created_at: string; processed_at: string | null }

const PAY_TONE: Record<string, "green" | "amber" | "red" | "violet" | "neutral"> = {
  captured: "green", authorized: "amber", created: "neutral", failed: "red", refunded: "violet", partially_refunded: "violet",
};

export function PaymentPanel({ orderId, orderNumber, isAdmin, method, paymentStatus, orderStatus, currency, refundable, payments, refunds }: {
  orderId: string; orderNumber: string; isAdmin: boolean; method: string; paymentStatus: PaymentStatus; orderStatus: OrderStatus; currency: string;
  refundable: number; payments: PaymentRow[] | null; refunds: RefundRow[] | null;
}) {
  const { pending, run } = useAction();
  const [refund, setRefund] = useState<{ amount: string; reason: string } | null>(null);
  const [cod, setCod] = useState<string | null>(null);
  const label = { razorpay: "Razorpay (UPI, cards, netbanking, wallets)", stripe: "Card via Stripe", cod: "Cash on delivery", none: "No payment needed" }[method] ?? method;

  return (
    <Card title="Payment">
      <p className="text-sm">{label}</p>
      {!isAdmin ? (
        <p className="mt-2 text-xs text-stone">Payment details and refunds are visible to admins.</p>
      ) : (
        <>
          {(payments ?? []).length > 0 && (
            <ul className="mt-3 grid gap-2">
              {payments!.map((p) => (
                <li key={p.id} className="rounded-md border border-black/10 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium tabular-nums">{formatMoney(p.amount, currency)}</span>
                    <Badge tone={PAY_TONE[p.status] ?? "neutral"}>{p.status.replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="mt-1 text-stone">{p.provider}{p.method && ` · ${p.method}`}{p.captured_at && ` · ${formatDateTime(p.captured_at)}`}</p>
                  {p.provider_payment_id && <p className="font-mono break-all text-stone">{p.provider_payment_id}</p>}
                  {p.amount_refunded > 0 && <p className="text-violet-700">{formatMoney(p.amount_refunded, currency)} refunded</p>}
                  {p.error_description && <p className="text-red-700">{p.error_description}</p>}
                </li>
              ))}
            </ul>
          )}
          {(refunds ?? []).length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-taupe">Refunds</p>
              <ul className="mt-1 grid gap-1.5">
                {refunds!.map((r) => (
                  <li key={r.id} className="text-xs">
                    <span className="font-medium tabular-nums">{formatMoney(r.amount, currency)}</span> <Badge tone={r.status === "processed" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                    <span className="block text-stone">{r.reason}{r.error && ` · ${r.error}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {refundable > 0 && !refund && <Button size="sm" variant="secondary" onClick={() => setRefund({ amount: fromMinor(refundable), reason: "" })}>Refund…</Button>}
            {method === "cod" && paymentStatus === "unpaid" && orderStatus !== "cancelled" && cod === null && <Button size="sm" variant="secondary" onClick={() => setCod("")}>Cash collected…</Button>}
          </div>
          {refund && (
            <form
              className="mt-3 grid gap-2 rounded-md border border-black/10 bg-black/[0.02] p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const amount = toMinor(refund.amount);
                if (amount === null || amount <= 0) return;
                if (!window.confirm(`Refund ${formatMoney(amount, currency)} to the customer? This sends money back through the payment provider.`)) return;
                run(() => refundOrder({ orderId, orderNumber, amount, reason: refund.reason }), () => setRefund(null));
              }}
            >
              <label className="grid gap-1 text-xs font-medium text-taupe">Amount (₹, up to {formatMoney(refundable, currency)})<input value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} inputMode="decimal" className={adminInput} /></label>
              <label className="grid gap-1 text-xs font-medium text-taupe">Reason (shown to the customer)<input value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} maxLength={300} required className={adminInput} /></label>
              <div className="flex gap-2"><Button type="submit" size="sm" variant="danger" busy={pending}>Issue refund</Button><Button size="sm" variant="ghost" onClick={() => setRefund(null)}>Cancel</Button></div>
            </form>
          )}
          {cod !== null && (
            <form className="mt-3 grid gap-2 rounded-md border border-black/10 bg-black/[0.02] p-3" onSubmit={(e) => { e.preventDefault(); run(() => markCodCollected(orderId, orderNumber, cod), () => setCod(null)); }}>
              <label className="grid gap-1 text-xs font-medium text-taupe">Courier remittance reference (optional)<input value={cod} onChange={(e) => setCod(e.target.value)} maxLength={120} className={adminInput} /></label>
              <div className="flex gap-2"><Button type="submit" size="sm" busy={pending}>Record payment</Button><Button size="sm" variant="ghost" onClick={() => setCod(null)}>Cancel</Button></div>
            </form>
          )}
        </>
      )}
    </Card>
  );
}

export function CancelPanel({ orderId, orderNumber, paid, isAdmin, shipped }: { orderId: string; orderNumber: string; paid: boolean; isAdmin: boolean; shipped: boolean }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ reason: "", restock: true, refund: true });
  if (paid && !isAdmin) return <Card title="Cancel order"><p className="text-sm text-taupe">This order is paid. Ask an admin to cancel it so the refund goes out with it.</p></Card>;
  return (
    <Card title="Cancel order">
      {!open ? (
        <Button size="sm" variant="ghost" className="text-red-700!" onClick={() => setOpen(true)}>Cancel this order…</Button>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!window.confirm("Cancel this order? The customer is emailed.")) return;
            run(() => cancelOrderAdmin({ orderId, orderNumber, ...form }), () => setOpen(false));
          }}
        >
          {shipped && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">This order has shipped. Usually a return is the better route.</p>}
          <label className="grid gap-1 text-xs font-medium text-taupe">Reason<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={300} required placeholder="Out of stock, customer request…" className={adminInput} /></label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.restock} onChange={(e) => setForm({ ...form, restock: e.target.checked })} className="size-4 accent-ink" /> Return items to stock</label>
          {paid && <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.refund} onChange={(e) => setForm({ ...form, refund: e.target.checked })} className="size-4 accent-ink" /> Refund the payment in full</label>}
          <div className="flex gap-2"><Button type="submit" size="sm" variant="danger" busy={pending}>Cancel order</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Keep it</Button></div>
        </form>
      )}
    </Card>
  );
}

export interface ReturnRequestView {
  id: string;
  kind: "return" | "cancellation";
  status: "requested" | "approved" | "rejected" | "received" | "refunded" | "closed";
  reason: string;
  details: string;
  admin_note: string;
  created_at: string;
  items: { quantity: number; title: string; value: number }[];
}

const RETURN_TONE: Record<string, "amber" | "blue" | "red" | "green" | "neutral" | "violet"> = {
  requested: "amber", approved: "blue", rejected: "red", received: "violet", refunded: "green", closed: "neutral",
};

export function ReturnPanel({ requests, orderId, orderNumber, isAdmin, currency, refundable }: { requests: ReturnRequestView[]; orderId: string; orderNumber: string; isAdmin: boolean; currency: string; refundable: number }) {
  const { pending, run } = useAction();
  const [note, setNote] = useState<Record<string, string>>({});
  const [refund, setRefund] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState(true);

  return (
    <Card title="Returns and cancellation requests">
      <ul className="grid gap-4">
        {requests.map((r) => {
          const value = r.items.reduce((n, i) => n + i.value, 0);
          const act = (action: "approve" | "reject" | "receive" | "close") =>
            run(() => updateReturnRequest({ requestId: r.id, orderNumber, action, note: note[r.id], restock }).then((x) => (x.ok ? { ok: true as const, message: x.message } : x)));
          return (
            <li key={r.id} className="rounded-md border border-black/10 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.kind === "return" ? "Return" : "Cancellation"}</span>
                <Badge tone={RETURN_TONE[r.status]}>{r.status}</Badge>
                <span className="ml-auto text-xs text-stone">{formatDateTime(r.created_at)}</span>
              </div>
              <p className="mt-1">Reason: {r.reason}</p>
              {r.details && <p className="mt-1 text-taupe">{r.details}</p>}
              {r.items.length > 0 && (
                <ul className="mt-2 text-xs text-taupe">
                  {r.items.map((i, n) => <li key={n}>{i.quantity} × {i.title} · {formatMoney(i.value, currency)}</li>)}
                </ul>
              )}
              {r.admin_note && <p className="mt-2 rounded bg-black/[0.03] px-2 py-1 text-xs">Note: {r.admin_note}</p>}
              {["requested", "approved", "received"].includes(r.status) && (
                <div className="mt-3 grid gap-2">
                  <input value={note[r.id] ?? ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} maxLength={2000} placeholder="Note to the customer (optional)" aria-label="Note to the customer" className={adminInput} />
                  <div className="flex flex-wrap items-center gap-2">
                    {r.status === "requested" && <Button size="sm" busy={pending} onClick={() => act("approve")}>Approve</Button>}
                    {r.status === "requested" && <Button size="sm" variant="ghost" busy={pending} onClick={() => act("reject")}>Reject</Button>}
                    {r.status === "approved" && r.kind === "return" && (
                      <>
                        <Button size="sm" busy={pending} onClick={() => act("receive")}>Items received</Button>
                        <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="size-4 accent-ink" /> Put back in stock</label>
                      </>
                    )}
                    {(r.status === "received" || (r.status === "approved" && r.kind === "cancellation")) && <Button size="sm" variant="ghost" busy={pending} onClick={() => act("close")}>Close</Button>}
                  </div>
                  {isAdmin && refundable > 0 && (r.status === "received" || (r.status === "approved" && r.kind === "cancellation")) && (
                    <div className="flex flex-wrap items-end gap-2 border-t border-black/10 pt-2">
                      <label className="grid gap-1 text-xs font-medium text-taupe">Refund (₹)<input value={refund[r.id] ?? fromMinor(Math.min(value || refundable, refundable))} onChange={(e) => setRefund({ ...refund, [r.id]: e.target.value })} inputMode="decimal" className={cx(adminInput, "w-32")} /></label>
                      <Button size="sm" variant="danger" busy={pending} onClick={() => {
                        const amount = toMinor(refund[r.id] ?? fromMinor(Math.min(value || refundable, refundable)));
                        if (amount === null || amount <= 0) return;
                        if (!window.confirm(`Refund ${formatMoney(amount, currency)} for this ${r.kind}?`)) return;
                        // Linked to the request, which is marked refunded once the provider confirms.
                        run(() => refundOrder({ orderId, orderNumber, amount, reason: r.kind === "return" ? "Refund for returned items" : "Refund for cancelled order", returnRequestId: r.id }));
                      }}>Issue refund</Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
