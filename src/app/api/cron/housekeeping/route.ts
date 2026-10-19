import { NextResponse } from "next/server";
import { processOutbox } from "@/lib/email";
import { reconcileRazorpay } from "@/lib/payments/reconcile";
import { CRON_SECRET } from "@/lib/server-env";
import { supabaseService } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled maintenance (Vercel Cron or any scheduler sending the CRON_SECRET bearer
 * token): give back stock held by expired unpaid orders, apply payments whose webhook
 * was missed, and send queued emails.
 */
export async function GET(request: Request) {
  if (!CRON_SECRET || request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: housekeeping, error } = await supabaseService().rpc("housekeeping");
  if (error) console.error("[cron] housekeeping:", error.message);
  const reconciled = await reconcileRazorpay();
  const emails = await processOutbox(50);
  return NextResponse.json({ ok: !error, housekeeping, reconciled, emails });
}
