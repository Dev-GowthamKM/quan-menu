import { mkdirSync } from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { COUPON, CUSTOMER, loadEnv, OWNER } from "./support/env";

/**
 * Creates the test owner and customer accounts and a test discount code, then signs both
 * in and saves their sessions. Only ever runs against a local database: it grants an
 * owner role directly, which must never happen on a real store.
 */
export default async function globalSetup(config: FullConfig) {
  const env = loadEnv();
  const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  if (!["localhost", "127.0.0.1"].includes(host) && process.env.E2E_ALLOW_REMOTE_DB !== "1") {
    throw new Error(`Refusing to run end-to-end tests against ${host}. Point .env.local at a local Supabase (npm run db:start).`);
  }
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const ids: Record<string, string> = {};
  for (const u of [OWNER, CUSTOMER]) {
    const created = await sb.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true, user_metadata: { full_name: u === OWNER ? "E2E Owner" : "E2E Customer" } });
    if (created.data.user) ids[u.email] = created.data.user.id;
    else {
      const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = data.users.find((x) => x.email === u.email);
      if (!found) throw new Error(`Could not create ${u.email}: ${created.error?.message}`);
      ids[u.email] = found.id;
      await sb.auth.admin.updateUserById(found.id, { password: u.password, email_confirm: true });
    }
  }
  await sb.from("user_roles").upsert({ user_id: ids[OWNER.email], role: "owner" });
  await sb.from("user_roles").delete().eq("user_id", ids[CUSTOMER.email]);
  await sb.from("coupons").upsert(
    { code: COUPON, description: "End-to-end test code", kind: "percentage", value: 1000, min_subtotal: 0, is_active: true, usage_limit: null, usage_limit_per_customer: null },
    { onConflict: "code" },
  );

  mkdirSync("tests/e2e/.auth", { recursive: true });
  const baseURL = (config.projects[0]?.use?.baseURL as string) ?? "http://localhost:3000";
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  for (const u of [OWNER, CUSTOMER]) {
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await page.goto(u === OWNER ? "/admin/login" : "/login");
    await page.fill("#email", u.email);
    await page.fill("#password", u.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 60_000 });
    await ctx.storageState({ path: u.state });
    await ctx.close();
  }
  await browser.close();
}
