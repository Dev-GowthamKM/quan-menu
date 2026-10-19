import { existsSync, readFileSync } from "node:fs";

/** Loads .env.local (if present) without overriding variables already set. */
export function loadEnv() {
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const need = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RAZORPAY_WEBHOOK_SECRET", "CRON_SECRET"];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`End-to-end tests need ${missing.join(", ")} (see README › Testing).`);
  return process.env as Record<string, string>;
}

export const OWNER = { email: "e2e-owner@taana.test", password: "E2E-owner-pass-2026!", state: "tests/e2e/.auth/owner.json" };
export const CUSTOMER = { email: "e2e-customer@taana.test", password: "E2E-customer-pass-2026!", state: "tests/e2e/.auth/customer.json" };
export const COUPON = "E2ETEST10";
