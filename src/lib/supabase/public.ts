import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";
import { storeHeaders } from "./store-header";

/**
 * Cookie-free client for public catalog reads of one store. It reads no request data,
 * so results can be cached and shared by every visitor of that store; row-level
 * security still limits it to published products.
 */
export const supabasePublic = (storeId: string | null) =>
  createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: storeHeaders(storeId) },
  });
