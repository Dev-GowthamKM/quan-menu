import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { cookies, headers } from "next/headers";
import { SITE_URL, SUPABASE_CONFIGURED } from "./env";
import { getUser } from "./session";
import { supabaseService } from "./supabase/admin";
import { supabasePublic } from "./supabase/public";
import { sessionClient } from "./supabase/session";
import type { AppRole } from "./types";

// Which store a request is for. The storefront goes by the web address the visitor
// used (each store has its own domains; any other address is the home store). The admin
// panel works on the store picked in its store switcher, among the stores the signed-in
// person works at. The middleware marks admin requests with SCOPE_HEADER.
//
// This only chooses which store's data to use. What the person may do there is decided
// by the database (row-level security and the store's staff list), so naming another
// store gets nobody anything they couldn't already see on that store's own site.

export interface StoreRef {
  /** Null only before the multi-store database update, when there is just the one store. */
  id: string | null;
  slug: string;
  name: string;
  status: "active" | "suspended";
  isHome: boolean;
  /** The store's main web address (a host name, with a port only locally), if it has one. */
  host: string | null;
  maintenance: boolean;
}

export interface MyStore extends Omit<StoreRef, "maintenance" | "id"> {
  id: string;
  role: AppRole;
}

export const SCOPE_HEADER = "x-store-scope";
export const ADMIN_STORE_COOKIE = "taana_admin_store";

const SINGLE_STORE: StoreRef = { id: null, slug: "main", name: "", status: "active", isHome: true, host: null, maintenance: false };

interface ResolvedStore {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  is_home: boolean;
  primary_host: string | null;
  maintenance: boolean;
}

/** The store a web address belongs to, cached for a minute (and refreshed when stores change). */
export const storeForHost = unstable_cache(
  async (host: string): Promise<StoreRef> => {
    if (!SUPABASE_CONFIGURED) return SINGLE_STORE;
    const { data, error } = await supabasePublic(null).rpc("resolve_store", { p_host: host });
    // PGRST202: the function doesn't exist yet (before the multi-store database update).
    if (error?.code === "PGRST202") return SINGLE_STORE;
    // Anything else is thrown, not cached: guessing could show one store's site on another's address.
    if (error || !data) throw new Error(`Could not look up the store for ${host}: ${error?.message ?? "no store"}`);
    const s = data as unknown as ResolvedStore;
    return { id: s.id, slug: s.slug, name: s.name, status: s.status, isHome: s.is_home, host: s.primary_host, maintenance: s.maintenance };
  },
  ["store-for-host"],
  { tags: ["stores"], revalidate: 60 },
);

/** The host name (and port) this request came in on. */
export async function requestHost() {
  const h = await headers();
  return (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
}

/** The store whose web address this request came in on. */
export const requestStore = cache(async (): Promise<StoreRef> => storeForHost(await requestHost()));

/** The stores the signed-in person works at (every store, for the platform's admins). */
export const myStores = cache(async (): Promise<MyStore[]> => {
  if (!SUPABASE_CONFIGURED || !(await getUser())) return [];
  const { data, error } = await (await sessionClient(null)).rpc("my_stores");
  if (error || !data) return [];
  return data.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    status: s.status === "suspended" ? "suspended" : "active",
    isHome: s.is_home,
    role: s.role,
    host: s.primary_host,
  }));
});

/**
 * The store the admin panel is working on: the one picked in the store switcher if the
 * person works there, else this address's store if they work there, else their first.
 */
export const adminStore = cache(async (): Promise<StoreRef> => {
  const [here, stores, jar] = await Promise.all([requestStore(), myStores(), cookies()]);
  const picked = jar.get(ADMIN_STORE_COOKIE)?.value;
  const s = stores.find((x) => x.id === picked) ?? stores.find((x) => x.id === here.id) ?? stores[0];
  if (!s) return here;
  return { id: s.id, slug: s.slug, name: s.name, status: s.status, isHome: s.isHome, host: s.host, maintenance: false };
});

/** The store this request works with: the admin panel's on admin pages, otherwise the web address's. */
export const contextStore = cache(async (): Promise<StoreRef> =>
  (await headers()).get(SCOPE_HEADER) === "admin" ? adminStore() : requestStore(),
);

/** The id to send with database calls for this request (null: the home store, before the update). */
export const contextStoreId = async () => (await contextStore()).id;

/** The service-role client for the store this request works with. */
export async function storeService() {
  return supabaseService(await contextStoreId());
}

/** Whether the signed-in person runs the platform (creates stores, acts as owner everywhere). */
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  if (!SUPABASE_CONFIGURED || !(await getUser())) return false;
  const { data, error } = await (await sessionClient(null)).rpc("is_platform_admin");
  return !error && data === true;
});

/**
 * A store's own address, like https://its-domain.in (the site's address for a store
 * without a domain). Links in emails and sign-in redirects use it.
 */
export function storeOrigin(store: Pick<StoreRef, "host">): string {
  if (!store.host) return SITE_URL;
  return `${new URL(SITE_URL).protocol}//${store.host}`;
}

const STORE_COLUMNS = "id, slug, name, status, is_home, store_domains (hostname, is_primary, created_at)";

/** The address of the store this request is for (canonical links, structured data). */
export const contextOrigin = async () => storeOrigin(await contextStore());

/** A store by id, for work that isn't tied to a request (emails, webhooks). */
export const storeById = cache(async (storeId: string | null): Promise<StoreRef> => {
  if (!storeId) return SINGLE_STORE;
  const { data, error } = await supabaseService().from("stores").select(STORE_COLUMNS).eq("id", storeId).maybeSingle();
  if (error || !data) throw new Error(`Store ${storeId} not found: ${error?.message ?? "no row"}`);
  return toStoreRef(data);
});

/** The home store: the platform's first store, which uses the server's own accounts. */
export const homeStore = cache(async (): Promise<StoreRef> => {
  if (!SUPABASE_CONFIGURED) return SINGLE_STORE;
  const { data, error } = await supabaseService().from("stores").select(STORE_COLUMNS).eq("is_home", true).maybeSingle();
  // Before the multi-store database update there is no stores table: just the one store.
  if (error?.code === "42P01" || error?.code === "PGRST205") return SINGLE_STORE;
  if (error || !data) throw new Error(`The home store could not be loaded: ${error?.message ?? "no row"}`);
  return toStoreRef(data);
});

function toStoreRef(data: {
  id: string;
  slug: string;
  name: string;
  status: string;
  is_home: boolean;
  store_domains: { hostname: string; is_primary: boolean; created_at: string }[] | null;
}): StoreRef {
  const domains = [...(data.store_domains ?? [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.created_at.localeCompare(b.created_at),
  );
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    status: data.status === "suspended" ? "suspended" : "active",
    isHome: data.is_home,
    host: domains[0]?.hostname ?? null,
    maintenance: false,
  };
}
