import { NextResponse } from "next/server";
import { deliverLoginCode } from "@/lib/login-codes";
import { SMS_HOOK_SECRET } from "@/lib/server-env";
import { verifyWebhook } from "@/lib/standard-webhooks";

export const dynamic = "force-dynamic";

interface SendSmsPayload {
  user?: { id?: string; phone?: string };
  sms?: { otp?: string; phone?: string };
}

/**
 * Supabase Auth's Send SMS hook (Authentication › Hooks in Supabase). Supabase calls this,
 * signed with SUPABASE_SMS_HOOK_SECRET, whenever it needs a one-time code delivered: signing
 * in or up with a mobile number, or adding a number to an account. A failure is answered
 * with { error: { http_code, message } }, which Supabase passes on to the shopper.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signed =
    !!SMS_HOOK_SECRET &&
    body.length <= 64 * 1024 &&
    verifyWebhook(
      SMS_HOOK_SECRET.split("|"),
      { id: request.headers.get("webhook-id"), timestamp: request.headers.get("webhook-timestamp"), signature: request.headers.get("webhook-signature") },
      body,
    );
  if (!signed) {
    if (!SMS_HOOK_SECRET) console.error("[auth/sms] SUPABASE_SMS_HOOK_SECRET is not set, so codes can't be sent.");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let payload: SendSmsPayload;
  try {
    payload = JSON.parse(body) as SendSmsPayload;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  // sms.phone is the number the code is for: a new number when one is being added.
  const result = await deliverLoginCode({
    phone: String(payload.sms?.phone || payload.user?.phone || ""),
    code: String(payload.sms?.otp ?? ""),
    userId: typeof payload.user?.id === "string" ? payload.user.id : null,
  });
  if (result.ok) return NextResponse.json({});
  return NextResponse.json({ error: { http_code: result.status, message: result.message } });
}
