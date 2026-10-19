import { NextResponse } from "next/server";
import { processOutbox } from "@/lib/email";
import { bodyHash, claimEvent, finishEvent } from "@/lib/payments/events";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { settleRazorpayPayment } from "@/lib/payments/service";
import { supabaseService } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface RazorpayEvent {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string | null } };
    refund?: { entity: { id: string; payment_id: string; status: string; amount: number } };
  };
}

/**
 * Razorpay webhook (Settings > Webhooks in the Razorpay dashboard). Every request must
 * carry a valid X-Razorpay-Signature; each event id is processed once.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  let event: RazorpayEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const eventId = request.headers.get("x-razorpay-event-id") || bodyHash(raw);
  if (!(await claimEvent("razorpay", eventId, event.event, event))) {
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
          const res = await settleRazorpayPayment(paymentId);
          orderId = "order" in res && res.order ? res.order.id : null;
        }
        break;
      }
      case "refund.processed":
      case "refund.failed": {
        const refund = event.payload.refund?.entity;
        if (refund) {
          const sb = supabaseService();
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
    await finishEvent("razorpay", eventId, undefined, orderId);
    await processOutbox();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = (e as Error).message;
    console.error("[webhook:razorpay]", event.event, message);
    await finishEvent("razorpay", eventId, message);
    // A 5xx makes Razorpay retry later.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
