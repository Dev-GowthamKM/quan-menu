import Link from "next/link";
import CatalogImage from "@/components/ui/CatalogImage";
import { Badge } from "@/components/ui/controls";
import { getUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { supabaseServer } from "@/lib/supabase/server";
import { FULFILLMENT_STATUS, ORDER_STATUS, PAYMENT_STATUS } from "@/lib/types-ui";

export default async function AccountOrdersPage() {
  const user = (await getUser())!;
  const sb = await supabaseServer();
  const { data: orders } = await sb
    .from("orders")
    .select("id, order_number, placed_at, status, payment_status, fulfillment_status, grand_total, currency, order_items(id, image_url, product_title)")
    .eq("user_id", user.id)
    .order("placed_at", { ascending: false })
    .limit(100);

  if (!orders?.length) {
    return (
      <div>
        <h2 className="font-serif text-2xl">Orders</h2>
        <p className="mt-4 text-taupe">You haven&apos;t placed an order yet. <Link href="/shop" className="underline">Start shopping</Link>.</p>
      </div>
    );
  }
  return (
    <div>
      <h2 className="font-serif text-2xl">Orders</h2>
      <ul className="mt-6 grid gap-4">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/account/orders/${o.order_number}`} className="block border border-line bg-paper p-5 hover:border-ink">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{o.order_number}</p>
                  <p className="text-sm text-taupe">Placed {formatDate(o.placed_at)} · {formatMoney(o.grand_total, o.currency)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                  <Badge tone={PAYMENT_STATUS[o.payment_status].tone}>{PAYMENT_STATUS[o.payment_status].label}</Badge>
                  {o.status !== "cancelled" && <Badge tone={FULFILLMENT_STATUS[o.fulfillment_status].tone}>{FULFILLMENT_STATUS[o.fulfillment_status].label}</Badge>}
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {o.order_items.slice(0, 6).map((i) => (
                  <span key={i.id} className="relative aspect-[4/5] w-12 overflow-hidden bg-bone">
                    <CatalogImage src={i.image_url} alt={i.product_title} fill sizes="48px" className="object-cover" />
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
