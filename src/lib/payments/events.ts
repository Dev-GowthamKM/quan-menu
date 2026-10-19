import "server-only";
import { createHash } from "node:crypto";
import { supabaseService } from "../supabase/admin";
import type { Json } from "../database.types";

/**
 * Records a webhook delivery by the provider's event id. Returns false when the same
 * event was already processed successfully, so retries and duplicates are ignored;
 * a delivery whose earlier processing failed is processed again.
 */
export async function claimEvent(provider: "razorpay" | "stripe", eventId: string, type: string, payload: unknown) {
  const sb = supabaseService();
  const { error } = await sb.from("payment_events").insert({ provider, event_id: eventId, event_type: type, payload: (payload ?? {}) as NonNullable<Json> });
  if (!error) return true;
  if (error.code !== "23505") throw new Error(error.message);
  const { data } = await sb.from("payment_events").select("processed_at").eq("provider", provider).eq("event_id", eventId).single();
  return !data?.processed_at;
}

export async function finishEvent(provider: "razorpay" | "stripe", eventId: string, error?: string, orderId?: string | null) {
  await supabaseService()
    .from("payment_events")
    .update(error ? { error: error.slice(0, 500) } : { processed_at: new Date().toISOString(), error: null, ...(orderId ? { order_id: orderId } : {}) })
    .eq("provider", provider)
    .eq("event_id", eventId);
}

export const bodyHash = (raw: string) => createHash("sha256").update(raw).digest("hex");
