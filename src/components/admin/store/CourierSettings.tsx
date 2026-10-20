"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { testShiprocket } from "@/server/admin/courier";
import { saveSettings } from "@/server/admin/store";
import type { PackageDefaults } from "@/lib/types";
import { Badge, Button } from "../../ui/controls";
import { SelectField, TextField, Toggle } from "../fields";
import { useToast } from "../Toaster";
import { Card } from "../ui";

/** Shipping › Courier connection: the Shiprocket switch, pickup address and default parcel. */
export default function CourierSettings({ settings, connected, webhookReady, webhookUrl, canEdit }: {
  settings: { enabled: boolean; pickupLocation: string; pickupPostcode: string; choice: string; pack: PackageDefaults };
  connected: boolean;
  webhookReady: boolean;
  webhookUrl: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    enabled: settings.enabled, location: settings.pickupLocation, postcode: settings.pickupPostcode, choice: settings.choice,
    length: String(settings.pack.length_cm), breadth: String(settings.pack.breadth_cm), height: String(settings.pack.height_cm), weight: String(settings.pack.item_weight_grams),
  });
  const n = (s: string) => Number(s.replace(",", "."));

  return (
    <Card
      title="Courier connection (Shiprocket)"
      actions={<Badge tone={connected ? "green" : "neutral"}>{connected ? "API user set" : "Not connected"}</Badge>}
      className="mb-6"
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await saveSettings("courier", {
              shiprocket_enabled: v.enabled,
              shiprocket_pickup_location: v.location,
              shiprocket_pickup_postcode: v.postcode.trim(),
              shiprocket_courier_choice: v.choice,
              package_defaults: { length_cm: n(v.length), breadth_cm: n(v.breadth), height_cm: n(v.height), item_weight_grams: Math.round(n(v.weight)) },
            });
            if (!res.ok) return toast(res.error, "error");
            toast("Courier settings saved.");
            router.refresh();
          });
        }}
      >
        <p className="text-sm text-taupe">
          Book couriers (Delhivery, Blue Dart, Xpressbees and others) from each order&apos;s page: Shiprocket assigns the AWB, prints the
          label and schedules the pickup, and tracking updates move the order to shipped, delivered or returned on their own.
        </p>
        <Toggle
          label="Book couriers with Shiprocket"
          hint={connected ? "Customers still pay the delivery rates you set in the zones below." : "Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD (an API user from Shiprocket › Settings › API) on the server first."}
          checked={v.enabled}
          onChange={(x) => setV({ ...v, enabled: x })}
          disabled={!canEdit}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Pickup address name" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} maxLength={80} disabled={!canEdit} hint="Exactly as it appears in Shiprocket › Pickup addresses." />
          <TextField label="Pickup PIN code" value={v.postcode} onChange={(e) => setV({ ...v, postcode: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" disabled={!canEdit} hint="Used for courier prices and delivery dates." />
          <SelectField label="Default courier" value={v.choice} onChange={(e) => setV({ ...v, choice: e.target.value })} disabled={!canEdit}>
            <option value="recommended">Shiprocket&apos;s recommendation</option>
            <option value="cheapest">Cheapest</option>
            <option value="fastest">Fastest</option>
          </SelectField>
        </div>
        <fieldset className="grid gap-4 sm:grid-cols-4" disabled={!canEdit}>
          <legend className="mb-2 text-xs font-medium text-taupe">Default parcel (staff can change it for each booking)</legend>
          <TextField label="Length (cm)" value={v.length} onChange={(e) => setV({ ...v, length: e.target.value })} inputMode="decimal" />
          <TextField label="Width (cm)" value={v.breadth} onChange={(e) => setV({ ...v, breadth: e.target.value })} inputMode="decimal" />
          <TextField label="Height (cm)" value={v.height} onChange={(e) => setV({ ...v, height: e.target.value })} inputMode="decimal" />
          <TextField label="Weight per item (g)" value={v.weight} onChange={(e) => setV({ ...v, weight: e.target.value })} inputMode="numeric" hint="When a product has no weight." />
        </fieldset>
        <div className="rounded-md bg-black/[0.03] px-3 py-2.5 text-xs leading-relaxed">
          <p className="font-medium">Tracking webhook</p>
          <p className="mt-1 text-taupe">
            In Shiprocket › Settings › API › Webhooks, add <span className="font-mono break-all text-ink">{webhookUrl}</span> with the token from
            <span className="font-mono"> SHIPROCKET_WEBHOOK_TOKEN</span>.{" "}
            {webhookReady ? <span className="text-emerald-800">The token is set on the server.</span> : <span className="text-amber-800">Set SHIPROCKET_WEBHOOK_TOKEN on the server first.</span>}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" busy={pending}>Save courier settings</Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!connected || pending}
              onClick={() =>
                start(async () => {
                  const res = await testShiprocket();
                  toast(res.ok ? res.message ?? "Connected." : res.error, res.ok ? undefined : "error");
                })
              }
            >
              Test connection
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
