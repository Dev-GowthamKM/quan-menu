import { notFound } from "next/navigation";
import OrderView from "@/components/store/order/OrderView";
import { findAccessibleOrder, loadOrderDetail } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { whatsappConfigured } from "@/lib/whatsapp";

export default async function AccountOrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const access = await findAccessibleOrder(decodeURIComponent(number).toUpperCase());
  if (!access) notFound();
  const [detail, settings] = await Promise.all([loadOrderDetail(access.id), getSettings()]);
  if (!detail) notFound();
  return (
    <div className="-mx-4 -my-10 sm:-mx-6 lg:-mx-10">
      <OrderView detail={detail} accessKey={null} whatsapp={settings.whatsapp_enabled && whatsappConfigured()} />
    </div>
  );
}
