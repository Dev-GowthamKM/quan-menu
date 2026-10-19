import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Maintenance mode is read from store settings at most every 30 seconds per instance.
let maintenance: { on: boolean; at: number } | null = null;

async function maintenanceOn() {
  if (maintenance && Date.now() - maintenance.at < 30_000) return maintenance.on;
  let on = false;
  try {
    const res = await fetch(`${URL_}/rest/v1/store_settings?select=maintenance_mode&id=eq.1`, { headers: { apikey: KEY }, signal: AbortSignal.timeout(2500) });
    if (res.ok) on = !!(await res.json())?.[0]?.maintenance_mode;
  } catch {
    on = false;
  }
  maintenance = { on, at: Date.now() };
  return on;
}

/** Storefront pages that maintenance mode hides (sign-in and API routes keep working). */
function isStorefront(path: string) {
  return !/^\/(admin|api|auth|login|signup|forgot-password|reset-password|maintenance|_next)(\/|$)/.test(path);
}

/**
 * Keeps the Supabase session fresh and sends signed-out visitors away from account and
 * admin pages. This is a convenience, not the security boundary: admin pages, actions
 * and the database each check the user's role again.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!URL_ || !KEY) return response;

  const path = request.nextUrl.pathname;
  const isAdmin = path === "/admin" || (path.startsWith("/admin/") && !path.startsWith("/admin/login"));
  const isAccount = path === "/account" || path.startsWith("/account/");
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  const closed = isStorefront(path) && (await maintenanceOn());
  if (closed && !hasSession) return NextResponse.rewrite(new URL("/maintenance", request.url), { status: 503 });
  if (!hasSession && !isAdmin && !isAccount) return response;

  const supabase = createServerClient(URL_, KEY, {
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
  // Never let a slow auth server hang every page: after 4 s, let the request through and
  // leave the decision to the page, which checks the session and role again itself.
  const result = await Promise.race([supabase.auth.getUser(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))]);
  if (!result) return closed ? NextResponse.rewrite(new URL("/maintenance", request.url), { status: 503 }) : response;
  const user = result.data.user;

  if (!user && (isAdmin || isAccount)) {
    const login = request.nextUrl.clone();
    login.pathname = isAdmin ? "/admin/login" : "/login";
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    const redirect = NextResponse.redirect(login);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  if (closed) {
    // Staff can still browse the store while it is closed to customers.
    const { data } = user ? await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle() : { data: null };
    if (!data) {
      const page = NextResponse.rewrite(new URL("/maintenance", request.url), { status: 503 });
      response.cookies.getAll().forEach((c) => page.cookies.set(c));
      return page;
    }
  }
  return response;
}

export const config = {
  // Everything except static files, images and webhooks (which carry no session).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|robots.txt|sitemap.xml|api/webhooks|api/cron|.*\\.(?:png|jpg|jpeg|webp|avif|svg|ico)$).*)"],
};
