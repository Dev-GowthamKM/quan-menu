import Link from "next/link";
import ProfileForm from "@/components/store/account/ProfileForm";
import { Badge } from "@/components/ui/controls";
import { getUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { supabaseServer } from "@/lib/supabase/server";
import { ORDER_STATUS } from "@/lib/types-ui";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const user = (await getUser())!;
  const sb = await supabaseServer();
  const [{ data: profile }, { data: orders }] = await Promise.all([
    sb.from("profiles").select("full_name, phone, marketing_opt_in, email").eq("id", user.id).single(),
    sb.from("orders").select("id, order_number, placed_at, status, grand_total, currency").eq("user_id", user.id).order("placed_at", { ascending: false }).limit(3),
  ]);
  const { password } = await searchParams;
  return (
    <div className="grid gap-12">
      {password === "updated" && <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Your password has been updated.</p>}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-2xl">Recent orders</h2>
          <Link href="/account/orders" className="text-sm underline underline-offset-4">All orders</Link>
        </div>
        {orders && orders.length > 0 ? (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/account/orders/${o.order_number}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-bone/40">
                  <span className="font-medium">{o.order_number}</span>
                  <span className="text-sm text-taupe">{formatDate(o.placed_at)}</span>
                  <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                  <span className="tabular-nums">{formatMoney(o.grand_total, o.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-taupe">No orders yet. <Link href="/shop" className="underline">Start shopping</Link>.</p>
        )}
      </section>
      <section>
        <h2 className="font-serif text-2xl">Profile & security</h2>
        <ProfileForm email={profile?.email ?? user.email ?? ""} initial={{ full_name: profile?.full_name ?? "", phone: profile?.phone ?? "", marketing_opt_in: profile?.marketing_opt_in ?? false }} />
      </section>
    </div>
  );
}
