import "server-only";
import { getUser } from "./auth";
import { verifyOrderKey } from "./order-link";
import { contextStoreId, storeService } from "./store";
import type { OrderDetail, Tone } from "./types-ui";

/**
 * The order with this number in the request's store, if the visitor may see it: the
 * signed-in customer who placed it, or anyone holding the signed link from the
 * confirmation page or email.
 */
export async function findAccessibleOrder(orderNumber: string, key?: string | null) {
  if (!/^[A-Z0-9-]{3,32}$/.test(orderNumber)) return null;
  const [sb, store] = await Promise.all([storeService(), contextStoreId()]);
  let query = sb.from("orders").select("id, user_id, order_number, email").eq("order_number", orderNumber);
  if (store) query = query.eq("store_id", store);
  const { data } = await query.maybeSingle();
  if (!data) return null;
  if (key && verifyOrderKey(data.id, key)) return { ...data, via: "link" as const };
  const user = await getUser();
  if (user && data.user_id === user.id) return { ...data, via: "account" as const };
  return null;
}

export async function loadOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const { data, error } = await (await storeService()).rpc("order_detail", { p_order_id: orderId });
  if (error) {
    console.error("[orders] detail:", error.message);
    return null;
  }
  return data as unknown as OrderDetail;
}

export type { Tone };
