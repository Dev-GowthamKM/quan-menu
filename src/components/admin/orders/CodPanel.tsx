"use client";
import { confirmCodForCustomer, setCodBlock } from "@/server/admin/orders";
import { formatDateTime } from "@/lib/format";
import { Button } from "../../ui/controls";
import { useAction } from "./useAction";

/** On a cash-on-delivery order: waiting for the customer's confirmation (staff can confirm). */
export function CodConfirmNotice({ orderId, orderNumber, deadline }: { orderId: string; orderNumber: string; deadline: string | null }) {
  const { pending, run } = useAction();
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p>
        Waiting for the customer to confirm this cash-on-delivery order.
        {deadline && ` It's cancelled automatically at ${formatDateTime(deadline)} if they don't.`} It can&apos;t be packed until then.
      </p>
      <Button size="sm" variant="secondary" busy={pending} onClick={() => run(() => confirmCodForCustomer(orderId, orderNumber))}>
        Confirmed with customer
      </Button>
    </div>
  );
}

/** In the customer card: their cash-on-delivery history, and blocking it. */
export function CodCustomer({ orderId, orderNumber, status }: {
  orderId: string;
  orderNumber: string;
  status: { blocked: boolean; returned: number; open: number; block_reason: string | null };
}) {
  const { pending, run } = useAction();
  return (
    <div className="mt-3 border-t border-black/10 pt-3 text-xs">
      <p className="font-medium">Cash on delivery</p>
      <p className="mt-0.5 text-stone">
        {status.open} waiting to ship · {status.returned} returned undelivered
        {status.blocked ? " · blocked" : status.block_reason ? " · not offered (limits)" : ""}
      </p>
      <button
        type="button"
        disabled={pending}
        className="mt-1 underline disabled:opacity-50"
        onClick={() => {
          if (status.blocked) return run(() => setCodBlock(orderId, orderNumber, false));
          const reason = window.prompt("Block cash on delivery for this customer's email and phone? They can still pay online. Reason (optional):", "");
          if (reason !== null) run(() => setCodBlock(orderId, orderNumber, true, reason));
        }}
      >
        {status.blocked ? "Allow cash on delivery again" : "Block cash on delivery"}
      </button>
    </div>
  );
}
