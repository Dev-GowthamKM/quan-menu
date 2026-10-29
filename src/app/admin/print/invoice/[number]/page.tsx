import type { Metadata } from "next";
import { notFound } from "next/navigation";
import InvoiceDocument from "@/components/InvoiceDocument";
import PrintButton from "@/components/ui/PrintButton";
import { ORDER_COLUMNS } from "@/lib/admin-orders";
import { requireRole, requireStaffPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

/** A tax invoice for printing or saving as PDF (components/InvoiceDocument.tsx). */
export default async function Invoice({ params }: { params: Promise<{ number: string }> }) {
  await requireStaffPage();
  const { supabase } = await requireRole("staff");
  const { number } = await params;
  const { data: order } = await supabase.from("orders").select(ORDER_COLUMNS).eq("order_number", number.toUpperCase()).maybeSingle();
  if (!order) notFound();
  const [{ data: items }, settings] = await Promise.all([supabase.from("order_items").select("*").eq("order_id", order.id).order("created_at"), getSettings()]);

  return (
    <main className="bg-white print:p-0">
      <div className="no-print mx-auto flex max-w-3xl justify-end px-8 pt-8"><PrintButton /></div>
      <InvoiceDocument order={order} items={items ?? []} settings={settings} />
    </main>
  );
}
