import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CustomerNotes from "@/components/admin/sales/CustomerNotes";
import { Card, OrderBadges, PageHeader, Stat, Table, Td, Th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/controls";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole("staff");
  const [{ data: profile }, addresses, orders, notes, role] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, phone, marketing_opt_in, created_at").eq("id", id).maybeSingle(),
    supabase.from("customer_addresses").select("id, full_name, line1, line2, city, state, postal_code, phone, is_default").eq("user_id", id).order("is_default", { ascending: false }),
    supabase.from("orders").select("id, order_number, status, payment_status, fulfillment_status, grand_total, amount_refunded, currency, placed_at").eq("user_id", id).order("placed_at", { ascending: false }).limit(100),
    supabase.from("customer_notes").select("id, body, author_id, created_at").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase.from("user_roles").select("role").eq("user_id", id).maybeSingle(),
  ]);
  if (!profile) notFound();
  const authorIds = [...new Set((notes.data ?? []).map((n) => n.author_id).filter(Boolean))] as string[];
  const { data: authors } = authorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", authorIds) : { data: [] };
  const authorName = new Map((authors ?? []).map((a) => [a.id, a.full_name || a.email || "Staff"]));
  const list = orders.data ?? [];
  const paid = list.filter((o) => ["paid", "partially_refunded", "refunded"].includes(o.payment_status));
  const spend = paid.reduce((n, o) => n + o.grand_total - o.amount_refunded, 0);

  return (
    <>
      <PageHeader title={profile.full_name || profile.email || profile.phone || "Customer"} back={{ href: "/admin/customers", label: "Customers" }} description={`Joined ${formatDate(profile.created_at)}`} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Lifetime spend" value={formatMoney(spend)} hint="Paid orders minus refunds" />
        <Stat label="Orders" value={list.filter((o) => o.status !== "cancelled").length} hint={`${list.filter((o) => o.status === "cancelled").length} cancelled`} />
        <Stat label="Average order" value={paid.length ? formatMoney(Math.round(spend / paid.length)) : "—"} />
        <Stat label="Last order" value={<span className="text-base">{list[0] ? formatDate(list[0].placed_at) : "—"}</span>} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-5">
          <Card title="Orders" padded={false}>
            {!list.length ? <p className="px-4 py-6 text-sm text-stone">No orders yet.</p> : (
              <Table className="rounded-none border-0">
                <thead><tr><Th>Order</Th><Th>Placed</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></thead>
                <tbody>
                  {list.map((o) => (
                    <tr key={o.id}>
                      <Td><Link href={`/admin/orders/${o.order_number}`} className="font-medium hover:underline">{o.order_number}</Link></Td>
                      <Td className="text-xs text-taupe">{formatDateTime(o.placed_at)}</Td>
                      <Td><OrderBadges status={o.status} payment={o.payment_status} fulfillment={o.fulfillment_status} /></Td>
                      <Td className="text-right tabular-nums">{formatMoney(o.grand_total, o.currency)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card title="Internal notes">
            <CustomerNotes customerId={id} notes={(notes.data ?? []).map((n) => ({ ...n, author: n.author_id ? authorName.get(n.author_id) ?? "Staff" : "Staff" }))} />
          </Card>
        </div>
        <div className="grid min-w-0 content-start gap-5">
          <Card title="Contact">
            {profile.email ? <p className="text-sm"><a href={`mailto:${profile.email}`} className="underline">{profile.email}</a></p> : <p className="text-sm text-stone">No email (signs in with a mobile number)</p>}
            {profile.phone && <p className="text-sm"><a href={`tel:${profile.phone}`} className="underline">{profile.phone}</a></p>}
            <p className="mt-2 text-xs text-stone">{profile.marketing_opt_in ? "Agreed to marketing emails" : "No marketing emails"}</p>
            {role.data?.role && <Badge tone="violet" className="mt-2">Staff: {role.data.role}</Badge>}
          </Card>
          <Card title="Addresses">
            {!(addresses.data ?? []).length ? <p className="text-sm text-stone">No saved addresses.</p> : (
              <ul className="grid gap-3 text-sm">
                {addresses.data!.map((a) => (
                  <li key={a.id}>{a.full_name}{a.is_default && <Badge className="ml-2">Default</Badge>}<br /><span className="text-taupe">{a.line1}{a.line2 && `, ${a.line2}`}, {a.city}, {a.state} {a.postal_code}</span></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
