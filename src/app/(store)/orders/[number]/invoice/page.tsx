import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import InvoiceDocument from "@/components/InvoiceDocument";
import { buttonClass } from "@/components/ui/controls";
import PrintButton from "@/components/ui/PrintButton";
import { invoiceAvailable } from "@/lib/invoice";
import { findAccessibleOrder, loadOrderDetail } from "@/lib/orders";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ key?: string }> };

/** The customer's invoice for an order, to print or save as PDF: for whoever may see the order (lib/orders.ts). */
export default async function OrderInvoicePage({ params, searchParams }: Props) {
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const access = await findAccessibleOrder(decodeURIComponent(number).toUpperCase(), sp.key);
  if (!access) notFound();
  const [detail, settings] = await Promise.all([loadOrderDetail(access.id), getSettings()]);
  if (!detail || !invoiceAvailable(detail.order)) notFound();
  const order = detail.order;
  const back = access.via === "account" && !sp.key ? `/account/orders/${order.order_number}` : `/orders/${order.order_number}${sp.key ? `?key=${encodeURIComponent(sp.key)}` : ""}`;

  return (
    <div className="container-page py-10 print:p-0">
      <div className="no-print mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-4">
        <Link href={back} className="text-sm underline underline-offset-4">Back to your order</Link>
        <PrintButton label="Print or save as PDF" className={buttonClass("primary", "md", "gap-2")} />
      </div>
      <InvoiceDocument order={order} items={detail.items} settings={settings} />
    </div>
  );
}
