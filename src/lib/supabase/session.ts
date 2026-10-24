import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";
import { storeHeaders } from "./store-header";

/**
 * The signed-in user's client, working with one store (or, with null, with whatever
 * needs no store: auth, the stores the user works at). Most code wants supabaseServer(),
 * which picks the request's store itself.
 */
export async function sessionClient(storeId: string | null) {
  const store = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: storeHeaders(storeId) },
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: the middleware refreshes the session instead.
        }
      },
    },
  });
}
