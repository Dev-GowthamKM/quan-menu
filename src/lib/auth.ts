import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { SUPABASE_CONFIGURED } from "./env";
import { supabaseServer } from "./supabase/server";
import type { AppRole } from "./types";

/** The signed-in user, verified with Supabase Auth (not just decoded from the cookie). */
export const getUser = cache(async (): Promise<User | null> => {
  if (!SUPABASE_CONFIGURED) return null;
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/** The user's staff role, or null for customers and visitors. */
export const getRole = cache(async (): Promise<AppRole | null> => {
  const user = await getUser();
  if (!user) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  return data?.role ?? null;
});

const RANK: Record<AppRole, number> = { staff: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: AppRole | null, needed: AppRole) {
  return !!role && RANK[role] >= RANK[needed];
}

export class AccessError extends Error {}

/**
 * For admin Server Actions and Route Handlers. The database enforces the same rules
 * with row-level security; checking here first gives a clear error and avoids work.
 */
export async function requireRole(needed: AppRole = "staff") {
  const user = await getUser();
  if (!user) throw new AccessError("Please sign in again.");
  const role = await getRole();
  if (!roleAtLeast(role, needed)) {
    throw new AccessError(needed === "staff" ? "Staff access required." : `This needs ${needed} access.`);
  }
  return { user, role: role!, supabase: await supabaseServer() };
}

/** For admin pages: send visitors to sign in, and show customers a 403. */
export async function requireStaffPage(needed: AppRole = "staff") {
  const user = await getUser();
  if (!user) redirect("/admin/login");
  const role = await getRole();
  if (!roleAtLeast(role, needed)) redirect(role ? "/admin?denied=1" : "/admin/login?denied=1");
  return { user, role: role! };
}

/** For account pages. */
export async function requireCustomerPage(next: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
