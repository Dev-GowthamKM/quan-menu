import "server-only";
import { storeById, type StoreRef } from "../store";
import { supabaseService } from "../supabase/admin";
import { fetchOrderPayments, razorpayKeys } from "./razorpay";
import { settleRazorpayPayment } from "./service";

/**
 * Catches payments whose webhook never arrived: asks Razorpay about every open payment
 * session from the last two days and applies any captured payment it finds. With a store,
 * only that store's sessions (the admin's button); without, every store's (the daily job),
 * each with its own Razorpay account.
 */
export async function reconcileRazorpay(store?: StoreRef, limit = 40) {
  const totals = { checked: 0, settled: 0, errors: 0 };
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  let query = supabaseService(store?.id)
    .from("payments")
    .select("provider_order_id, store_id")
    .eq("provider", "razorpay")
    .in("status", ["created", "failed"])
    .not("provider_order_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (store?.id) query = query.eq("store_id", store.id);
  const { data } = await query;

  const byStore = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const key = store ? String(store.id) : row.store_id;
    byStore.set(key, (byStore.get(key) ?? new Set()).add(row.provider_order_id!));
  }
  for (const [storeId, ids] of byStore) {
    const owner = store ?? (await storeById(storeId));
    const keys = await razorpayKeys(owner);
    if (!keys) continue;
    for (const id of ids) {
      totals.checked++;
      try {
        for (const p of await fetchOrderPayments(keys, id)) {
          if (p.status === "captured" || p.status === "authorized") {
            const res = await settleRazorpayPayment(owner, p.id);
            if (res.status === "paid") totals.settled++;
          }
        }
      } catch (e) {
        totals.errors++;
        console.error("[reconcile]", id, (e as Error).message);
      }
    }
  }
  return totals;
}
