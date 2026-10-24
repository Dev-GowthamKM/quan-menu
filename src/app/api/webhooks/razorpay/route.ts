import { NextResponse } from "next/server";
import { processOutbox } from "@/lib/email";
import { bodyHash, claimEvent, finishEvent } from "@/lib/payments/events";
import { razorpayKeys, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { settleRazorpayPayment } from "@/lib/payments/service";
import { homeStore, storeById, type StoreRef } from "@/lib/store";
import { supabaseService } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface RazorpayEvent {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string | null } };
    refund?: { entity: { id: string; payment_id: string; status: string; amount: number } };
  };
}

/** The store a webhook URL is for: ?store=<id> (each store's own Razorpay account), else the home store. */
async function webhookStore(request: Request): Promise<StoreRef | null> {
  const id = new URL(request.url).searchParams.get("store");
  if (!id) return homeStore();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null;
  return storeById(id).catch(() => null);
}

/**
 * Razorpay webhook (Settings > Webhooks in the Razorpay dashboard). Each store's account
 * sends to this URL with ?store=<its id> (Admin › Settings › Payments shows it). Every
 * request must carry a valid X-Razorpay-Signature made with that store's webhook secret;
 * each event id is processed once.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const store = await webhookStore(request);
  const keys = store ? await razorpayKeys(store) : null;
  if (!store || !keys || !verifyWebhookSignature(keys, raw, request.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  let event: RazorpayEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const eventId = request.headers.get("x-razorpay-event-id") || bodyHash(raw);
  if (!(await claimEvent(store.id, "razorpay", eventId, event.event, event))) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    let orderId: string | null = null;
    switch (event.event) {
      case "payment.authorized":
      case "payment.captured":
      case "payment.failed":
      case "order.paid": {
        const paymentId = event.payload.payment?.entity.id;
        if (paymentId) {
          const res = await settleRazorpayPayment(store, paymentId);
          orderId = "order" in res && res.order ? res.order.id : null;
        }
        break;
      }
      case "refund.processed":
      case "refund.failed": {
        const refund = event.payload.refund?.entity;
        if (refund) {
          const sb = supabaseService(store.id);
          const { data: id } = await sb.rpc("refund_by_provider_id", { p_provider: "razorpay", p_provider_refund_id: refund.id });
          if (id) {
            await sb.rpc("complete_refund", {
              p_refund_id: id as string,
              p_provider_refund_id: refund.id,
              p_status: event.event === "refund.processed" ? "processed" : "failed",
              p_error: event.event === "refund.failed" ? "Refund failed at Razorpay" : "",
            });
          }
        }
        break;
      }
      default:
        break;
    }
    await finishEvent(store.id, "razorpay", eventId, undefined, orderId);
    await processOutbox();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = (e as Error).message;
    console.error("[webhook:razorpay]", event.event, message);
    await finishEvent(store.id, "razorpay", eventId, message);
    // A 5xx makes Razorpay retry later.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
