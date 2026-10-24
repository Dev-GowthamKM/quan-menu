// Shared setup for integration tests. They run against the local Supabase stack
// (`npm run db:start`), using the real API (PostgREST, Auth, Storage) the way the app
// and any attacker would.
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

interface LocalEnv {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
  DB_URL: string;
  MAILPIT_URL: string;
}

let cached: LocalEnv | null = null;

export function localEnv(): LocalEnv {
  if (cached) return cached;
  if (process.env.SUPABASE_TEST_URL) {
    cached = {
      API_URL: process.env.SUPABASE_TEST_URL,
      ANON_KEY: process.env.SUPABASE_TEST_ANON_KEY!,
      SERVICE_ROLE_KEY: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!,
      DB_URL: process.env.SUPABASE_TEST_DB_URL!,
      MAILPIT_URL: process.env.SUPABASE_TEST_MAILPIT_URL || "http://127.0.0.1:54324",
    };
  } else {
    cached = JSON.parse(execSync("supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  }
  return cached!;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export const anon = () => createClient(localEnv().API_URL, localEnv().ANON_KEY, noSession);
export const service = () => createClient(localEnv().API_URL, localEnv().SERVICE_ROLE_KEY, noSession);

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: localEnv().DB_URL });
  await client.connect();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    await client.end();
  }
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
}

/** Creates a confirmed user, optionally with a staff role, and returns a signed-in client. */
export async function makeUser(role?: "owner" | "admin" | "staff", name = "Test Person"): Promise<TestUser> {
  const email = `t-${randomUUID().slice(0, 8)}@example.com`;
  const password = `pw-${randomUUID()}`;
  const admin = service();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) throw error;
  const id = data.user.id;
  if (role) await sql("insert into public.user_roles (user_id, role) values ($1, $2)", [id, role]);
  const client = anon();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id, email, password, client };
}

/** A client that works with one store (the app sends this header with every call). */
export function storeClient(storeId: string, key: "anon" | "service" = "anon") {
  const env = localEnv();
  return createClient(env.API_URL, key === "service" ? env.SERVICE_ROLE_KEY : env.ANON_KEY, {
    ...noSession,
    global: { headers: { "x-store-id": storeId } },
  });
}

/** The user signed in on a client that works with one store. */
export async function signedInAt(user: TestUser, storeId: string) {
  const client = storeClient(storeId);
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

export async function homeStoreId() {
  const [row] = await sql<{ id: string }>("select public.home_store_id() as id");
  return row.id;
}

/** A visible product variant with enough stock, plus its product id. */
export async function makeProduct(opts: { stock?: number; price?: number; status?: string; tags?: string[] } = {}) {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [product] = await sql<{ id: string }>(
    `insert into public.products (title, slug, price, status, tags)
     values ($1, $2, $3, $4, $5) returning id`,
    [`Test ${slug}`, slug, opts.price ?? 199900, opts.status ?? "active", opts.tags ?? []],
  );
  const sku = `T-${slug.slice(5).toUpperCase()}`;
  const [variant] = await sql<{ id: string }>(
    `insert into public.product_variants (product_id, sku, size, color, stock_quantity)
     values ($1, $2, 'M', 'Black', $3) returning id`,
    [product.id, sku, opts.stock ?? 10],
  );
  return { productId: product.id, variantId: variant.id, slug, sku };
}

export const address = {
  full_name: "Asha Rao",
  phone: "+91 98765 43210",
  line1: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  postal_code: "560001",
  country: "IN",
};

export const guestToken = () => randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

/** A mobile number no other test uses (cash-on-delivery limits count orders per phone). */
export const uniquePhone = () => `+91 9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

/** The test address with its own phone number. */
export const uniqueAddress = () => ({ ...address, phone: uniquePhone() });

export const uniqueEmail = (prefix = "guest") => `${prefix}-${randomUUID().slice(0, 8)}@example.com`;
