import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OrderView from "@/components/store/order/OrderView";
import { findAccessibleOrder, loadOrderDetail } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { whatsappConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ key?: string; placed?: string; stripe_session?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const access = await findAccessibleOrder(decodeURIComponent(number).toUpperCase(), sp.key);
  if (!access) notFound();
  const [detail, settings] = await Promise.all([loadOrderDetail(access.id), getSettings()]);
  if (!detail) notFound();
  return (
    <OrderView
      detail={detail}
      accessKey={sp.key ?? null}
      justPlaced={sp.placed === "1"}
      stripeSession={sp.stripe_session ?? null}
      whatsapp={settings.whatsapp_enabled && whatsappConfigured()}
    />
  );
}
