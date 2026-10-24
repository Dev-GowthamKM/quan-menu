import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Must match SCOPE_HEADER in lib/store.ts and STORE_HEADER in lib/supabase/store-header.ts
// (this file runs on the edge and imports neither).
const SCOPE_HEADER = "x-store-scope";
const STORE_HEADER = "x-store-id";
// Must match LOOK_COOKIE in lib/look.ts: an admin's unsaved look, shown on this storefront only.
const LOOK_COOKIE = "taana_look";

interface HostStore {
  id: string | null;
  closed: boolean;
}

// Which store each web address belongs to, and whether its storefront is closed
// (maintenance mode, or a suspended store), read at most every 30 seconds per instance.
const hosts = new Map<string, { at: number; store: HostStore }>();

async function storeFor(host: string): Promise<HostStore> {
  const hit = hosts.get(host);
  if (hit && Date.now() - hit.at < 30_000) return hit.store;
  let store: HostStore = { id: null, closed: false };
  try {
    const res = await fetch(`${URL_}/rest/v1/rpc/resolve_store`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_host: host }),
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const s = (await res.json()) as { id?: string; status?: string; maintenance?: boolean } | null;
      store = { id: s?.id ?? null, closed: !!s?.maintenance || s?.status === "suspended" };
    } else if (res.status === 404) {
      // Before the multi-store database update: the one store's maintenance switch.
      const old = await fetch(`${URL_}/rest/v1/store_settings?select=maintenance_mode&id=eq.1`, { headers: { apikey: KEY }, signal: AbortSignal.timeout(2500) });
      if (old.ok) store = { id: null, closed: !!(await old.json())?.[0]?.maintenance_mode };
    }
  } catch {
    store = { id: null, closed: false };
  }
  if (hosts.size > 500) hosts.clear();
  hosts.set(host, { at: Date.now(), store });
  return store;
}

/** Storefront pages that maintenance mode hides (sign-in and API routes keep working). */
function isStorefront(path: string) {
  return !/^\/(admin|api|auth|login|signup|forgot-password|reset-password|maintenance|_next)(\/|$)/.test(path);
}

/**
 * Keeps the Supabase session fresh, marks admin requests (so the app uses the admin
 * panel's store rather than the web address's), closes storefronts in maintenance and
 * sends signed-out visitors away from account and admin pages. This is a convenience,
 * not the security boundary: admin pages, actions and the database each check the
 * user's role again.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Supabase sends email links to the site's main address when a store's address isn't
  // in its Redirect URLs yet; finish them at /auth/confirm rather than dropping them.
  if (request.nextUrl.searchParams.has("token_hash") && path !== "/auth/confirm") {
    const confirm = request.nextUrl.clone();
    confirm.pathname = "/auth/confirm";
    return NextResponse.redirect(confirm);
  }
  // "Preview on the store" opens /?look=<signed look>: keep it in a cookie on this address and
  // drop it from the URL (the store's layout checks the signature). ?look=exit ends it.
  const look = request.nextUrl.searchParams.get("look");
  if (look !== null && isStorefront(path)) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("look");
    const redirect = NextResponse.redirect(clean);
    if (look === "exit" || look.length > 2000) redirect.cookies.delete(LOOK_COOKIE);
    else redirect.cookies.set(LOOK_COOKIE, look, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 2 * 60 * 60 });
    return redirect;
  }
  const isAdmin = path === "/admin" || (path.startsWith("/admin/") && !path.startsWith("/admin/login"));
  const scope = path === "/admin" || path.startsWith("/admin/") ? "admin" : "store";
  // Always set here, so a value sent by the browser never reaches the app.
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set(SCOPE_HEADER, scope);
    return NextResponse.next({ request: { headers } });
  };
  let response = forward();
  if (!URL_ || !KEY) return response;

  const isAccount = path === "/account" || path.startsWith("/account/");
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const store = isStorefront(path) ? await storeFor(host) : null;
  const closed = !!store?.closed;
  if (closed && !hasSession) return NextResponse.rewrite(new URL("/maintenance", request.url), { status: 503 });
  if (!hasSession && !isAdmin && !isAccount) return response;

  const supabase = createServerClient(URL_, KEY, {
    global: { headers: store?.id ? { [STORE_HEADER]: store.id } : {} },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward();
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
    // The store's staff can still browse it while it is closed to customers.
    const { data: role } = user ? await supabase.rpc("my_role") : { data: null };
    if (!role) {
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
