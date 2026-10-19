import type { Metadata } from "next";
import CartView from "@/components/store/checkout/CartView";
import { getCart } from "@/server/cart";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your bag", robots: { index: false } };

export default async function CartPage() {
  const quote = await getCart();
  return <CartView initial={quote} />;
}
