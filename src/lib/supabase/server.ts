import "server-only";
import { contextStoreId } from "../store";
import { sessionClient } from "./session";

/**
 * The signed-in user's client for Server Components, Server Actions and Route
 * Handlers, working with the request's store. Row-level security applies, so it can
 * only do what that user may do in that store.
 */
export async function supabaseServer() {
  return sessionClient(await contextStoreId());
}
