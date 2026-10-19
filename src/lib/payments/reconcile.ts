import "server-only";
import { supabaseService } from "../supabase/admin";
import { fetchOrderPayments, razorpayConfigured } from "./razorpay";
import { settleRazorpayPayment } from "./service";

/**
 * Catches payments whose webhook never arrived: asks Razorpay about every open payment
 * session from the last two days and applies any captured payment it finds.
 */
export async function reconcileRazorpay(limit = 40) {
  if (!razorpayConfigured()) return { checked: 0, settled: 0, errors: 0 };
  const sb = supabaseService();
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data } = await sb
    .from("payments")
    .select("provider_order_id")
    .eq("provider", "razorpay")
    .in("status", ["created", "failed"])
    .not("provider_order_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  const ids = [...new Set((data ?? []).map((r) => r.provider_order_id!))];
  let settled = 0;
  let errors = 0;
  for (const id of ids) {
    try {
      for (const p of await fetchOrderPayments(id)) {
        if (p.status === "captured" || p.status === "authorized") {
          const res = await settleRazorpayPayment(p.id);
          if (res.status === "paid") settled++;
        }
      }
    } catch (e) {
      errors++;
      console.error("[reconcile]", id, (e as Error).message);
    }
  }
  return { checked: ids.length, settled, errors };
}
