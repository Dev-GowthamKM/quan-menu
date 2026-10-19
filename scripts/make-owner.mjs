// First-owner setup. Makes an existing account the store owner, but only while the store
// has no owner yet (the database refuses otherwise; later staff are added in Admin > Staff).
//
//   npm run make-owner -- owner@example.com
//   npm run make-owner -- owner@example.com --create --password 'a long password'   (local/dev)
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or .env.local.
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const email = args.find((a) => a.includes("@"));
const create = args.includes("--create");
const pwIndex = args.indexOf("--password");
const password = pwIndex >= 0 ? args[pwIndex + 1] : null;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error("Usage: npm run make-owner -- you@example.com [--create --password '...']");
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local or the environment).");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

if (create) {
  if (!password || password.length < 8) {
    console.error("--create needs --password with at least 8 characters.");
    process.exit(1);
  }
  const { error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Store Owner" } });
  if (error && !/already/i.test(error.message)) {
    console.error("Could not create the user:", error.message);
    process.exit(1);
  }
}

const { error } = await sb.rpc("bootstrap_owner", { p_email: email });
if (error) {
  console.error(error.hint || error.message);
  process.exit(1);
}
console.log(`${email} is now the store owner. Sign in at /admin/login.`);
