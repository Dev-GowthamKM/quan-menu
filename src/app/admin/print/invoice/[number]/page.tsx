import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintButton from "@/components/admin/PrintButton";
import { ORDER_COLUMNS } from "@/lib/admin-orders";
import { requireRole, requireStaffPage } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import type { ContactInfo } from "@/lib/types";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

interface Address { full_name?: string; phone?: string; line1?: string; line2?: string; landmark?: string; city?: string; state?: string; postal_code?: string; gstin?: string }

function Addr({ a }: { a: Address | null }) {
  if (!a) return null;
  return (
    <p className="text-sm leading-relaxed">
      {a.full_name}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} {a.postal_code}<br />{a.phone}
    </p>
  );
}

/** A tax invoice for printing or saving as PDF. Line amounts come from the order snapshot. */
export default async function Invoice({ params }: { params: Promise<{ number: string }> }) {
  await requireStaffPage();
  const { supabase } = await requireRole("staff");
  const { number } = await params;
  const { data: order } = await supabase.from("orders").select(ORDER_COLUMNS).eq("order_number", number.toUpperCase()).maybeSingle();
  if (!order) notFound();
  const [{ data: items }, settings] = await Promise.all([supabase.from("order_items").select("*").eq("order_id", order.id).order("created_at"), getSettings()]);
  const contact = (settings.contact ?? {}) as ContactInfo;
  const c = order.currency;
  const ship = order.shipping_address as Address;
  const bill = (order.billing_address as Address | null) ?? ship;
  const inclusive = order.tax_mode === "inclusive";

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-ink print:p-0">
      <div className="no-print mb-6 flex justify-end"><PrintButton /></div>
      <header className="flex items-start justify-between gap-6 border-b border-black/15 pb-6">
        <div>
          <p className="text-xl font-semibold">{settings.store_name}</p>
          {contact.address && <p className="mt-1 max-w-xs text-sm whitespace-pre-line text-taupe">{contact.address}</p>}
          {(contact.email || contact.phone) && <p className="text-sm text-taupe">{[contact.email, contact.phone].filter(Boolean).join(" · ")}</p>}
          {settings.gstin && <p className="mt-1 text-sm">GSTIN: <span className="font-mono">{settings.gstin}</span></p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{settings.gstin ? "Tax invoice" : "Invoice"}</p>
          <p className="text-sm">No. {order.order_number}</p>
          <p className="text-sm">Date {formatDate(order.paid_at ?? order.placed_at)}</p>
          {order.status === "cancelled" && <p className="mt-1 text-sm font-semibold text-red-700">Cancelled</p>}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6 border-b border-black/15 py-5">
        <div><p className="mb-1 text-xs font-semibold tracking-wider text-taupe uppercase">Bill to</p><Addr a={bill} /><p className="text-sm">{order.email}</p></div>
        <div><p className="mb-1 text-xs font-semibold tracking-wider text-taupe uppercase">Ship to</p><Addr a={ship} /><p className="mt-1 text-xs text-taupe">Place of supply: {ship?.state}</p></div>
      </section>

      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className="border-b border-black/15 text-left text-xs text-taupe">
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Rate</th>
            <th className="py-2 text-right font-medium">Taxable value</th>
            <th className="py-2 text-right font-medium">{order.tax_label}</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((l) => {
            const taxable = inclusive ? l.line_total - l.tax_amount : l.line_total;
            const amount = inclusive ? l.line_total : l.line_total + l.tax_amount;
            return (
              <tr key={l.id} className="border-b border-black/5 align-top">
                <td className="py-2">
                  {l.product_title}
                  <span className="block text-xs text-taupe">{[l.color, l.size].filter(Boolean).join(" / ")} · SKU {l.sku}</span>
                  {l.discount_amount > 0 && <span className="block text-xs text-taupe">Discount {formatMoney(l.discount_amount, c)}</span>}
                </td>
                <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(l.unit_price, c)}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(taxable, c)}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(l.tax_amount, c)}<span className="block text-xs text-taupe">{l.tax_rate_bps / 100}%</span></td>
                <td className="py-2 text-right tabular-nums">{formatMoney(amount, c)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 grid max-w-xs gap-1 text-sm">
        <div className="flex justify-between"><dt>Items</dt><dd className="tabular-nums">{formatMoney(order.subtotal - order.discount_total, c)}</dd></div>
        <div className="flex justify-between"><dt>Shipping</dt><dd className="tabular-nums">{formatMoney(order.shipping_total, c)}</dd></div>
        {order.cod_fee > 0 && <div className="flex justify-between"><dt>Cash on delivery fee</dt><dd className="tabular-nums">{formatMoney(order.cod_fee, c)}</dd></div>}
        <div className="flex justify-between text-taupe"><dt>{order.tax_label} {inclusive ? "included" : ""}</dt><dd className="tabular-nums">{formatMoney(order.tax_total, c)}</dd></div>
        <div className="flex justify-between border-t border-black/15 pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(order.grand_total, c)}</dd></div>
        {order.amount_refunded > 0 && <div className="flex justify-between text-taupe"><dt>Refunded</dt><dd className="tabular-nums">−{formatMoney(order.amount_refunded, c)}</dd></div>}
        <div className="flex justify-between text-xs text-taupe"><dt>Payment</dt><dd>{order.payment_method === "cod" ? "Cash on delivery" : order.payment_method === "razorpay" ? "Paid online (Razorpay)" : order.payment_method === "stripe" ? "Paid by card" : "—"}</dd></div>
      </dl>
      <footer className="mt-10 border-t border-black/15 pt-4 text-xs text-taupe">
        {settings.gstin ? "Tax is computed per item at the applicable GST rate. " : ""}This is a computer-generated invoice and needs no signature.
      </footer>
    </main>
  );
}
