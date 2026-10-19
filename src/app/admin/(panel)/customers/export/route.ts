import { AccessError, requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { sqlNull } from "@/lib/db";
import { fromMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Customer list as CSV. Admins only; each export is recorded in the audit log. */
export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await requireRole("admin");
  } catch (e) {
    if (e instanceof AccessError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 100);
  const rows: unknown[][] = [["email", "name", "phone", "orders", "lifetime_spend", "last_order_at", "joined_at", "marketing_opt_in"]];
  const optIn = new Map<string, boolean>();
  for (let offset = 0; offset < 100_000; offset += 500) {
    const { data, error } = await ctx.supabase.rpc("admin_customers", { p_q: q, p_limit: 500, p_offset: offset });
    if (error) return new Response(error.message, { status: 500 });
    const ids = (data ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: profiles } = await ctx.supabase.from("profiles").select("id, marketing_opt_in").in("id", ids);
      for (const p of profiles ?? []) optIn.set(p.id, p.marketing_opt_in);
    }
    for (const c of data ?? []) {
      rows.push([c.email, c.full_name, c.phone, c.orders_count, fromMinor(Number(c.lifetime_spend)), c.last_order_at ?? "", c.created_at, optIn.get(c.id) ? "yes" : "no"]);
    }
    if ((data ?? []).length < 500) break;
  }
  await ctx.supabase.rpc("log_admin_action", { p_action: "export", p_entity_type: "customers", p_entity_id: sqlNull<string>(null), p_details: { count: rows.length - 1, q } });
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
