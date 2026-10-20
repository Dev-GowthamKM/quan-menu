import { NextResponse } from "next/server";
import { DEMO, SCHEMA_VERSION, SITE_URL } from "@/lib/config";
import { MODEL } from "@/lib/ai";
import { supabasePublic } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

/** Whether the database has the schema.sql this version needs. "unknown" when it didn't answer in time. */
async function schemaState(): Promise<"ok" | "outdated" | "unknown" | null> {
  if (DEMO) return null;
  const r = await Promise.race([
    supabasePublic().rpc("schema_version"),
    new Promise<null>((done) => setTimeout(() => done(null), 3000)),
  ]);
  if (!r) return "unknown";
  if (r.error) return r.error.code === "PGRST202" ? "outdated" : "unknown";
  return Number(r.data) >= SCHEMA_VERSION ? "ok" : "outdated";
}

/**
 * Deployment check: which settings are present. Reports yes/no only, never values,
 * so it is safe to leave public. Open /api/health after deploying.
 */
export async function GET() {
  const schema = await schemaState();
  const missing = [
    DEMO && "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (running in demo mode)",
    !SITE_URL && "NEXT_PUBLIC_SITE_URL (QR codes fall back to the address in the browser)",
    schema === "outdated" && "supabase/schema.sql is out of date: run it again in Supabase → SQL Editor",
  ].filter(Boolean);
  // Optional: without it, common dishes still translate from the built-in list.
  const optional = [
    !process.env.ANTHROPIC_API_KEY && "ANTHROPIC_API_KEY (photo reading and AI translation are off)",
  ].filter(Boolean);
  return NextResponse.json({
    ok: missing.length === 0,
    mode: DEMO ? "demo" : "live",
    schema,
    ai: !!process.env.ANTHROPIC_API_KEY,
    model: MODEL,
    siteUrl: SITE_URL || null,
    missing,
    optional,
  });
}
