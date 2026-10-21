"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDateTime } from "@/lib/format";
import { confirmCodOrder } from "@/server/orders";
import { Button } from "../../ui/controls";

/** "Please confirm your cash-on-delivery order" on the customer's order page. */
export default function CodConfirm({ orderNumber, accessKey, deadline }: { orderNumber: string; accessKey: string | null; deadline: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="border border-ink bg-paper px-5 py-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="font-serif text-xl">Please confirm your order</p>
        <p className="mt-1 text-sm text-taupe">
          You chose to pay cash on delivery. Confirm the order and we&apos;ll start packing it.
          {deadline && ` Orders that aren't confirmed by ${formatDateTime(deadline)} are cancelled automatically.`}
        </p>
        {error && <p role="alert" className="mt-2 text-sm text-sale">{error}</p>}
      </div>
      <Button
        className="mt-4 shrink-0 sm:mt-0"
        busy={pending}
        onClick={() =>
          start(async () => {
            const res = await confirmCodOrder(orderNumber, accessKey);
            if (!res.ok) return setError(res.error);
            router.refresh();
          })
        }
      >
        Confirm order
      </Button>
    </div>
  );
}
