/**
 * The header that tells the database which store a call is for (current_store_id() in
 * SQL). It only chooses the store: row-level security and the store's staff list still
 * decide what the caller may do there. Without it the database uses the home store.
 */
export const STORE_HEADER = "x-store-id";

export const storeHeaders = (storeId: string | null | undefined): Record<string, string> =>
  storeId ? { [STORE_HEADER]: storeId } : {};
