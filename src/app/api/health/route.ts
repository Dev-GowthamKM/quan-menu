import { NextResponse } from "next/server";
import { RAZORPAY_KEY_ID, SITE_URL, SUPABASE_CONFIGURED } from "@/lib/env";
import * as env from "@/lib/server-env";
import { supabasePublic } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

/**
 * Deployment check. Reports which settings are present (yes/no only, never values) and
 * whether the database answers, so it is safe to leave public.
 */
export async function GET() {
  let database = "not configured";
  if (SUPABASE_CONFIGURED) {
    const { error } = await supabasePublic().from("store_settings").select("id").eq("id", 1).maybeSingle();
    database = error ? (/schema cache|does not exist/i.test(error.message) ? "migrations not applied" : "unreachable") : "ok";
  }
  const required = {
    NEXT_PUBLIC_SUPABASE_URL_and_ANON_KEY: SUPABASE_CONFIGURED,
    SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: !!process.env.NEXT_PUBLIC_SITE_URL,
    ORDER_LINK_SECRET: !!process.env.ORDER_LINK_SECRET,
  };
  const payments = {
    razorpay: !!(RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
    razorpay_webhook: !!env.RAZORPAY_WEBHOOK_SECRET,
    razorpay_mode: RAZORPAY_KEY_ID.startsWith("rzp_live_") ? "live" : RAZORPAY_KEY_ID ? "test" : null,
    stripe: !!env.STRIPE_SECRET_KEY,
    stripe_webhook: !!env.STRIPE_WEBHOOK_SECRET,
  };
  const optional = {
    email: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
    cron: !!env.CRON_SECRET,
    shiprocket: !!(env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD),
    shiprocket_webhook: !!env.SHIPROCKET_WEBHOOK_TOKEN,
    whatsapp: !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
  };
  const ok = database === "ok" && Object.values(required).every(Boolean);
  return NextResponse.json({ ok, site: SITE_URL, database, required, payments, optional }, { status: ok ? 200 : 503 });
}
