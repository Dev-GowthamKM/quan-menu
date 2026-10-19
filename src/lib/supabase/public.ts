import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";

/**
 * Cookie-free client for public catalog reads. It reads no request data, so pages
 * using it can be cached and shared by every visitor; row-level security still limits
 * it to published products.
 */
export const supabasePublic = () =>
  createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
