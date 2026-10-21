import { NextResponse } from "next/server";
import { DEMO } from "@/lib/config";
import { supabasePublic } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

/**
 * Called once a day by Vercel (see vercel.json). Supabase's free plan pauses a project after a
 * week with too little database activity, which would stop every printed menu, so this makes a
 * few ordinary reads. They are public, read-only and tiny, so the route needs no secret.
 */
export async function GET() {
  if (DEMO) return NextResponse.json({ ok: true, mode: "demo" });
  const sb = supabasePublic();
  const results = await Promise.all([
    sb.rpc("schema_version"),
    sb.from("stalls").select("id", { count: "exact", head: true }).eq("published", true),
    sb.from("dishes").select("id").limit(1),
  ]);
  const errors = results.map((r) => r.error?.message).filter(Boolean);
  if (errors.length) console.error("[keepalive]", errors.join(" | "));
  return NextResponse.json({ ok: !errors.length, live: results[1].count ?? null }, { status: errors.length ? 503 : 200 });
}
