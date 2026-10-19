import { NextResponse } from "next/server";
import { processOutbox } from "@/lib/email";
import { claimEvent, finishEvent } from "@/lib/payments/events";
import { settleStripeSession } from "@/lib/payments/service";
import { verifyStripeSignature } from "@/lib/payments/stripe";
import { supabaseService } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface StripeEvent {
  id: string;
  type: string;
  data: { object: { id: string; status?: string; metadata?: Record<string, string> } };
}

/** Stripe webhook (optional). Signature-checked and processed once per event id. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(raw) as StripeEvent;
  if (!(await claimEvent("stripe", event.id, event.type, event))) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const obj = event.data.object;
    let orderId: string | null = null;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const res = await settleStripeSession(obj.id);
        orderId = "order" in res && res.order ? res.order.id : null;
        break;
      }
      case "checkout.session.async_payment_failed": {
        orderId = obj.metadata?.order_id ?? null;
        if (orderId) {
          await supabaseService().rpc("record_payment_failure", {
            p_order_id: orderId,
            p_provider: "stripe",
            p_provider_order_id: obj.id,
            p_provider_payment_id: "",
            p_method: "card",
            p_error_code: "async_payment_failed",
            p_error_description: "The bank declined the payment.",
          });
        }
        break;
      }
      case "refund.updated":
      case "charge.refund.updated": {
        const sb = supabaseService();
        const { data: id } = await sb.rpc("refund_by_provider_id", { p_provider: "stripe", p_provider_refund_id: obj.id });
        if (id && (obj.status === "succeeded" || obj.status === "failed")) {
          await sb.rpc("complete_refund", {
            p_refund_id: id as string,
            p_provider_refund_id: obj.id,
            p_status: obj.status === "succeeded" ? "processed" : "failed",
            p_error: obj.status === "failed" ? "Refund failed at Stripe" : "",
          });
        }
        break;
      }
      default:
        break;
    }
    await finishEvent("stripe", event.id, undefined, orderId);
    await processOutbox();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = (e as Error).message;
    console.error("[webhook:stripe]", event.type, message);
    await finishEvent("stripe", event.id, message);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
