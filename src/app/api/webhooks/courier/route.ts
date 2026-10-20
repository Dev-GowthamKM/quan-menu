import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processOutbox } from "@/lib/email";
import { SHIPROCKET_WEBHOOK_TOKEN } from "@/lib/server-env";
import { parseShiprocketWebhook } from "@/lib/shipping/tracking";
import { supabaseService } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function tokenMatches(given: string | null) {
  if (!SHIPROCKET_WEBHOOK_TOKEN || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(SHIPROCKET_WEBHOOK_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Shiprocket tracking webhook (Settings > API > Webhooks in Shiprocket). Shiprocket sends
 * the token you choose there in the x-api-key header. The path avoids the words Shiprocket
 * refuses in webhook URLs ("shiprocket", "kartrocket", "sr", "kr").
 */
export async function POST(request: Request) {
  if (!tokenMatches(request.headers.get("x-api-key"))) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const update = parseShiprocketWebhook(body);
  // Updates we don't act on are still acknowledged, so Shiprocket doesn't retry them.
  if (!update) return NextResponse.json({ ok: true, ignored: true });

  const { data, error } = await supabaseService().rpc("courier_update", {
    p_provider: "shiprocket",
    p_event_key: update.key,
    p_awb: update.awb,
    p_status: update.status,
    p_label: update.label,
    p_location: update.location,
    p_event_at: update.at ?? new Date().toISOString(),
    p_etd: update.etd ?? undefined,
    p_payload: body as never,
  });
  if (error) {
    console.error("[webhook:courier]", update.awb, error.message);
    // A 5xx makes Shiprocket retry later.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
  await processOutbox();
  return NextResponse.json({ ok: true, ...(data as object) });
}
