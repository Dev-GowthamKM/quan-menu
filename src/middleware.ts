import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { timedFetch } from "@/lib/supabase/timed-fetch";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Longest the middleware waits on Supabase before letting the page load anyway. */
const LIMIT_MS = 4000;

/** Keeps the Supabase login session fresh. Does nothing in demo mode or for visitors who aren't signed in. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!URL_ || !KEY) return response;
  // No login cookie means nothing to refresh: skip the network call entirely.
  if (!request.cookies.getAll().some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"))) return response;

  const supabase = createServerClient(URL_, KEY, {
    global: { fetch: timedFetch(LIMIT_MS - 1000) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // A token refresh plus the user check is two calls; never let them hold the page past LIMIT_MS.
  await Promise.race([
    supabase.auth.getUser().catch(() => null),
    new Promise((done) => setTimeout(done, LIMIT_MS)),
  ]);
  return response;
}

export const config = {
  // /api/say (menu voice) needs no login, and must stay cacheable: no session cookies on it.
  matcher: ["/", "/login", "/dashboard/:path*", "/api/((?!say).*)", "/auth/:path*"],
};
