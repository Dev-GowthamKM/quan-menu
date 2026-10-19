import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OrderView from "@/components/store/order/OrderView";
import { findAccessibleOrder, loadOrderDetail } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ key?: string; placed?: string; stripe_session?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const access = await findAccessibleOrder(decodeURIComponent(number).toUpperCase(), sp.key);
  if (!access) notFound();
  const detail = await loadOrderDetail(access.id);
  if (!detail) notFound();
  return <OrderView detail={detail} accessKey={sp.key ?? null} justPlaced={sp.placed === "1"} stripeSession={sp.stripe_session ?? null} />;
}
