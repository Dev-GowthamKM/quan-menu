import type { Metadata } from "next";
import CourierSettings from "@/components/admin/store/CourierSettings";
import ShippingManager, { type ZoneView } from "@/components/admin/store/ShippingManager";
import { PageHeader } from "@/components/admin/ui";
import { Notice } from "@/components/ui/controls";
import { requireRole, roleAtLeast } from "@/lib/auth";
import { SITE_URL } from "@/lib/env";
import { SHIPROCKET_WEBHOOK_TOKEN } from "@/lib/server-env";
import { getSettings, packageDefaultsOf } from "@/lib/settings";
import { shiprocketConfigured } from "@/lib/shipping/shiprocket";
import { INDIAN_STATES } from "@/lib/india";

export const metadata: Metadata = { title: "Shipping" };

export default async function ShippingPage() {
  const { supabase, role, store } = await requireRole("staff");
  const [zones, rates, rules, providers, settings] = await Promise.all([
    supabase.from("shipping_zones").select("*").order("priority", { ascending: false }).order("name"),
    supabase.from("shipping_rates").select("*").order("sort_order").order("price"),
    supabase.from("postal_code_rules").select("*").order("postal_code"),
    supabase.from("shipping_providers").select("*").order("name"),
    getSettings(),
  ]);
  const view: ZoneView[] = (zones.data ?? []).map((z) => ({ ...z, rates: (rates.data ?? []).filter((r) => r.zone_id === z.id) }));
  return (
    <>
      <PageHeader title="Shipping" description="Delivery zones and rates, PIN codes you can't serve, and the couriers you use. Checkout picks the most specific zone for each address." />
      {zones.error && <Notice tone="error" className="mb-4">{zones.error.message}</Notice>}
      {store.isHome && <CourierSettings
        settings={{
          enabled: settings.shiprocket_enabled, pickupLocation: settings.shiprocket_pickup_location, pickupPostcode: settings.shiprocket_pickup_postcode,
          choice: settings.shiprocket_courier_choice, pack: packageDefaultsOf(settings),
        }}
        connected={shiprocketConfigured(store)}
        webhookReady={!!SHIPROCKET_WEBHOOK_TOKEN}
        webhookUrl={`${SITE_URL}/api/webhooks/courier`}
        canEdit={roleAtLeast(role, "admin")}
      />}
      <ShippingManager
        zones={view}
        rules={rules.data ?? []}
        providers={providers.data ?? []}
        canEdit={roleAtLeast(role, "admin")}
        states={INDIAN_STATES as unknown as string[]}
        freeShippingThreshold={settings.free_shipping_threshold}
      />
    </>
  );
}
