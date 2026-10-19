import "server-only";
import { headers } from "next/headers";
import { supabaseService } from "./supabase/admin";

/** The client's IP as seen by the hosting platform's proxy. */
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

/**
 * Fixed-window rate limit shared by every server instance (stored in Postgres).
 * Returns true when the request may go ahead. Fails open if the database is
 * unreachable, because the checkout itself still enforces every business rule.
 */
export async function rateLimit(bucket: string, max: number, windowSeconds: number, key?: string) {
  try {
    const id = key ?? (await clientIp());
    const { data, error } = await supabaseService().rpc("rate_limit_hit", {
      p_key: `${bucket}:${id}`,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rate-limit]", error.message);
      return true;
    }
    return data === true;
  } catch (e) {
    console.error("[rate-limit]", (e as Error).message);
    return true;
  }
}
