"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelOrder, requestReturn } from "@/server/orders";
import { formatDate } from "@/lib/format";
import type { OrderDetail } from "@/lib/types";
import { Button, Field, Notice, Select, Textarea } from "../../ui/controls";
import { Dialog } from "../../ui/Dialog";

const CANCEL_REASONS = ["Changed my mind", "Ordered by mistake", "Found a better price", "Delivery takes too long", "Other"];
const RETURN_REASONS = ["Too small", "Too big", "Not as pictured", "Quality not as expected", "Arrived damaged", "Wrong item sent", "Changed my mind"];
const RETURN_STATUS: Record<string, string> = {
  requested: "Requested, waiting for review",
  approved: "Approved, please send the items back",
  rejected: "Declined",
  received: "Items received, refund in progress",
  refunded: "Refunded",
  closed: "Closed",
};

export default function OrderActions({ detail, accessKey }: { detail: OrderDetail; accessKey: string | null }) {
  const router = useRouter();
  const o = detail.order;
  const [dialog, setDialog] = useState<"cancel" | "return" | null>(null);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});

  const openCancellation = detail.returns.some((r) => r.kind === "cancellation" && r.status === "requested");
  const canCancel = (o.status === "pending_payment" || o.status === "confirmed") && ["unfulfilled", "processing"].includes(o.fulfillment_status) && !openCancellation;
  const deliveredAt = o.delivered_at ? new Date(o.delivered_at) : null;
  const returnable = detail.items.filter((i) => {
    if (!i.is_returnable || !deliveredAt) return false;
    const deadline = new Date(deliveredAt.getTime() + i.return_window_days * 86_400_000);
    const pending = detail.returns
      .filter((r) => r.kind === "return" && ["requested", "approved", "received"].includes(r.status))
      .flatMap((r) => r.items)
      .filter((x) => x.order_item_id === i.id)
      .reduce((n, x) => n + x.quantity, 0);
    return deadline > new Date() && i.quantity - i.quantity_returned - pending > 0;
  });
  const canReturn = o.fulfillment_status === "delivered" && returnable.length > 0;

  const close = () => {
    setDialog(null);
    setState({});
  };

  return (
    <div className="mt-8">
      {detail.returns.length > 0 && (
        <ul className="mb-6 grid gap-2">
          {detail.returns.map((r) => (
            <li key={r.id} className="border border-line bg-paper px-4 py-3 text-sm">
              <span className="font-medium">{r.kind === "cancellation" ? "Cancellation request" : "Return request"}</span> · {formatDate(r.created_at)} ·{" "}
              <span className="text-taupe">{RETURN_STATUS[r.status] ?? r.status}</span>
            </li>
          ))}
        </ul>
      )}
      {state.done && <Notice tone="success" className="mb-4">{state.done}</Notice>}
      <div className="flex flex-wrap gap-3">
        {canCancel && <Button variant="secondary" onClick={() => setDialog("cancel")}>Cancel order</Button>}
        {canReturn && <Button variant="secondary" onClick={() => setDialog("return")}>Request a return</Button>}
      </div>

      <Dialog open={dialog === "cancel"} onClose={close} title="Cancel this order?" size="sm">
        <form
          className="grid gap-5 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setState({ busy: true });
            const res = await cancelOrder(o.order_number, accessKey, reason || "Changed my mind");
            if (!res.ok) return setState({ error: res.error });
            setDialog(null);
            setState({ done: res.message });
            router.refresh();
          }}
        >
          <p className="text-sm text-taupe">
            {o.payment_status === "paid"
              ? "Your order has been paid, so we'll confirm the cancellation and refund you to the original payment method."
              : "Nothing has been charged, so cancelling is immediate."}
          </p>
          <Field label="Reason" htmlFor="cancel-reason">
            <Select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason</option>
              {CANCEL_REASONS.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </Field>
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={close}>Keep order</Button>
            <Button type="submit" variant="danger" busy={state.busy}>Cancel order</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog === "return"} onClose={close} title="Request a return" size="md">
        <form
          className="grid gap-5 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const items = Object.entries(qty).filter(([, n]) => n > 0).map(([order_item_id, quantity]) => ({ order_item_id, quantity }));
            setState({ busy: true });
            const res = await requestReturn(o.order_number, accessKey, { items, reason, details });
            if (!res.ok) return setState({ error: res.error });
            setDialog(null);
            setState({ done: res.message });
            router.refresh();
          }}
        >
          <fieldset className="grid gap-3">
            <legend className="text-xs font-medium text-taupe">Items to return</legend>
            {returnable.map((i) => (
              <label key={i.id} className="flex items-center justify-between gap-3 border border-line px-3 py-2 text-sm">
                <span>{i.product_title} <span className="text-taupe">({i.variant_title})</span></span>
                <Select aria-label={`Quantity of ${i.product_title} to return`} value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })} className="h-9 w-20" wrapperClassName="w-20">
                  {Array.from({ length: i.quantity - i.quantity_returned + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </label>
            ))}
          </fieldset>
          <Field label="Reason" htmlFor="return-reason">
            <Select id="return-reason" required value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason</option>
              {RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Anything else? (optional)" htmlFor="return-details">
            <Textarea id="return-details" rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={close}>Close</Button>
            <Button type="submit" busy={state.busy}>Request return</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
