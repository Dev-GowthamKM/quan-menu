import "server-only";
import { AccessError, requireRole } from "./auth";
import { isPlatformAdmin } from "./store";

/**
 * The admin's view of setup: store admins see their store's checklist; the platform's
 * administrators also see the platform's (database updates, server settings). Before the
 * multi-store update there are no platform administrators, so the store's owners count.
 */
export async function setupAccess() {
  try {
    const ctx = await requireRole("admin");
    const platform = (await isPlatformAdmin()) || (ctx.store.id === null && ctx.role === "owner");
    return { ...ctx, platform };
  } catch (e) {
    if (e instanceof AccessError) return null;
    throw e;
  }
}
