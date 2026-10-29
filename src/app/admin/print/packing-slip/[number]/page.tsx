import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintButton from "@/components/ui/PrintButton";
import { ORDER_COLUMNS } from "@/lib/admin-orders";
import { requireRole, requireStaffPage } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Packing slip" };
export const dynamic = "force-dynamic";

interface Address { full_name?: string; phone?: string; line1?: string; line2?: string; landmark?: string; city?: string; state?: string; postal_code?: string }

/** What to pack and where it goes; no prices, so it can travel in the parcel. */
export default async function PackingSlip({ params }: { params: Promise<{ number: string }> }) {
  await requireStaffPage();
  const { supabase } = await requireRole("staff");
  const { number } = await params;
  const { data: order } = await supabase.from("orders").select(ORDER_COLUMNS).eq("order_number", number.toUpperCase()).maybeSingle();
  if (!order) notFound();
  const [{ data: items }, settings] = await Promise.all([supabase.from("order_items").select("*").eq("order_id", order.id).order("sku"), getSettings()]);
  const a = order.shipping_address as Address;
  const method = order.shipping_method as { name?: string } | null;

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-ink print:p-0">
      <div className="no-print mb-6 flex justify-end"><PrintButton /></div>
      <header className="flex items-start justify-between border-b-2 border-ink pb-4">
        <div>
          <p className="text-xl font-semibold">{settings.store_name}</p>
          <p className="text-sm text-taupe">Packing slip</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold">{order.order_number}</p>
          <p className="text-sm">{formatDate(order.placed_at)}</p>
          <p className="text-sm font-medium">{order.payment_method === "cod" && order.payment_status === "unpaid" ? "CASH ON DELIVERY" : "PREPAID"}</p>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-6 py-5">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wider text-taupe uppercase">Ship to</p>
          <p className="text-base leading-relaxed">
            <b>{a?.full_name}</b><br />{a?.line1}{a?.line2 ? `, ${a.line2}` : ""}<br />{a?.landmark && <>{a.landmark}<br /></>}{a?.city}, {a?.state} <b>{a?.postal_code}</b><br />{a?.phone}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wider text-taupe uppercase">Delivery</p>
          <p className="text-sm">{method?.name ?? "Standard"}</p>
          {order.customer_note && <p className="mt-3 rounded border border-black/20 p-2 text-sm"><b>Customer note:</b> {order.customer_note}</p>}
        </div>
      </section>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-black/20 text-left text-xs text-taupe">
            <th className="w-8 py-2"><span className="sr-only">Packed</span></th>
            <th className="py-2 font-medium">SKU</th>
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Qty</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((l) => (
            <tr key={l.id} className="border-b border-black/10">
              <td className="py-3"><span className="inline-block size-4 border border-black/40" /></td>
              <td className="py-3 font-mono">{l.sku}</td>
              <td className="py-3">{l.product_title}<span className="block text-xs text-taupe">{[l.color, l.size].filter(Boolean).join(" / ")}</span></td>
              <td className="py-3 text-right text-base font-semibold tabular-nums">{l.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-6 text-right text-sm">Total pieces: <b>{(items ?? []).reduce((n, l) => n + l.quantity, 0)}</b></p>
      <footer className="mt-10 border-t border-black/15 pt-4 text-xs text-taupe">Thank you for shopping with {settings.store_name}. Returns: see the returns policy on our website, or reply to your order email.</footer>
    </main>
  );
}
