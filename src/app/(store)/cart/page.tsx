import type { Metadata } from "next";
import CartView from "@/components/store/checkout/CartView";
import { getCart } from "@/server/cart";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your bag", robots: { index: false } };

export default async function CartPage({ searchParams }: { searchParams: Promise<{ restored?: string }> }) {
  const [quote, { restored }] = await Promise.all([getCart(), searchParams]);
  return <CartView initial={quote} restored={restored === "1"} />;
}
