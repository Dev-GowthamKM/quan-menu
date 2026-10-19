import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { SUPABASE_URL } from "../env";
import { SUPABASE_SERVICE_ROLE_KEY } from "../server-env";

/**
 * Service-role client: bypasses row-level security. Used only on the server for
 * checkout, payments, webhooks and email, always after the caller has been verified
 * (session, signed link or provider signature). Never import this from client code.
 */
export function supabaseService() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Checkout and payments need it (see README).");
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
