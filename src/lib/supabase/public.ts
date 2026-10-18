import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";
import { timedFetch } from "./timed-fetch";

/**
 * Cookie-free client for public reads (the customer menu). It reads no request
 * data, so pages using it can be cached and served to every scanner; row-level
 * security still limits it to published stalls.
 */
export const supabasePublic = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timedFetch(5000) },
  });
