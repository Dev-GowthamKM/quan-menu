import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getUser } from "./session";
import { contextStore, isPlatformAdmin } from "./store";
import { supabaseServer } from "./supabase/server";
import type { AppRole } from "./types";

export { getUser };

/** The user's staff role in the request's store, or null for customers and visitors. */
export const getRole = cache(async (): Promise<AppRole | null> => {
  const user = await getUser();
  if (!user) return null;
  const { data } = await (await supabaseServer()).rpc("my_role");
  return data ?? null;
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
  const [supabase, store] = await Promise.all([supabaseServer(), contextStore()]);
  return { user, role: role!, supabase, store };
}

/** For admin pages: send visitors to sign in, and show customers a 403. */
export async function requireStaffPage(needed: AppRole = "staff") {
  const user = await getUser();
  if (!user) redirect("/admin/login");
  const role = await getRole();
  if (!roleAtLeast(role, needed)) redirect(role ? "/admin?denied=1" : "/admin/login?denied=1");
  return { user, role: role! };
}

/** For the platform's pages (creating and running stores): its administrators only. */
export async function requirePlatformPage() {
  const ctx = await requireStaffPage();
  if (!(await isPlatformAdmin())) redirect("/admin?denied=1");
  return ctx;
}

/** For account pages. */
export async function requireCustomerPage(next: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
