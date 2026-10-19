"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deletePostalRule, deleteShippingRow, savePostalRule, saveProvider, saveRate, saveZone } from "@/server/admin/store";
import { formatMoney, fromMinor, toMinor } from "@/lib/money";
import { Badge, Button, cx } from "../../ui/controls";
import { Dialog } from "../../ui/Dialog";
import { PlusIcon, TrashIcon } from "../../ui/icons";
import ChipsInput from "../ChipsInput";
import { TextField, Toggle } from "../fields";
import { useToast } from "../Toaster";
import { adminInput, Card } from "../ui";

interface Rate {
  id: string; zone_id: string; name: string; description: string; price: number; free_over: number | null; min_days: number; max_days: number;
  cod_available: boolean; sort_order: number; is_active: boolean;
}
export interface ZoneView {
  id: string; name: string; states: string[]; postal_prefixes: string[]; priority: number; cod_available: boolean; is_active: boolean; is_sample: boolean; rates: Rate[];
}
interface Rule { postal_code: string; blocks: string; note: string }
interface Provider { id: string; name: string; tracking_url_template: string; is_active: boolean }

type Result = { ok: true; message?: string } | { ok: false; error: string };

export default function ShippingManager({ zones, rules, providers, canEdit, states, freeShippingThreshold }: {
  zones: ZoneView[]; rules: Rule[]; providers: Provider[]; canEdit: boolean; states: string[]; freeShippingThreshold: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [zone, setZone] = useState<(Omit<ZoneView, "id" | "rates" | "is_sample"> & { id: string | null }) | null>(null);
  const [rate, setRate] = useState<{ id: string | null; zone_id: string; name: string; description: string; price: string; free_over: string; min_days: string; max_days: string; cod_available: boolean; sort_order: number; is_active: boolean } | null>(null);
  const [rule, setRule] = useState({ postal_code: "", blocks: "all" as "all" | "cod", note: "" });
  const [provider, setProvider] = useState<{ id: string | null; name: string; tracking_url_template: string; is_active: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return toast(res.error, "error");
      }
      setError(null);
      toast(res.message ?? "Saved.");
      after?.();
      router.refresh();
    });

  return (
    <div className="grid gap-5">
      {!canEdit && <p className="text-sm text-taupe">Only admins can change shipping settings.</p>}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Zones and rates</h2>
        {canEdit && <Button size="sm" onClick={() => { setError(null); setZone({ id: null, name: "", states: [], postal_prefixes: [], priority: 0, cod_available: true, is_active: true }); }}><PlusIcon size={14} /> Add zone</Button>}
      </div>
      {freeShippingThreshold ? <p className="-mt-3 text-xs text-stone">Store-wide free delivery over {formatMoney(freeShippingThreshold)} also applies (Settings › Checkout).</p> : null}
      {zones.map((z) => (
        <Card
          key={z.id}
          title={<span className="flex flex-wrap items-center gap-2">{z.name}{!z.is_active && <Badge>Off</Badge>}{z.is_sample && <Badge tone="violet">Sample</Badge>}{!z.cod_available && <Badge tone="amber">No COD</Badge>}</span>}
          actions={canEdit && <button type="button" className="text-xs underline" onClick={() => { setError(null); setZone({ ...z }); }}>Edit zone</button>}
        >
          <p className="text-xs text-taupe">
            {z.postal_prefixes.length ? `PIN codes starting ${z.postal_prefixes.join(", ")}` : z.states.length ? z.states.join(", ") : "All of India"}
            {z.priority ? ` · priority ${z.priority}` : ""}
          </p>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs text-stone"><th className="py-1 font-normal">Rate</th><th className="py-1 font-normal">Price</th><th className="py-1 font-normal">Free over</th><th className="py-1 font-normal">Delivery</th><th className="py-1 font-normal">COD</th><th /></tr></thead>
            <tbody>
              {z.rates.map((r) => (
                <tr key={r.id} className={cx("border-t border-black/5", !r.is_active && "text-stone")}>
                  <td className="py-2">{r.name}{r.description && <span className="block text-xs text-stone">{r.description}</span>}</td>
                  <td className="py-2 tabular-nums">{r.price ? formatMoney(r.price) : "Free"}</td>
                  <td className="py-2 tabular-nums">{r.free_over ? formatMoney(r.free_over) : "—"}</td>
                  <td className="py-2">{r.min_days}–{r.max_days} days</td>
                  <td className="py-2">{r.cod_available && z.cod_available ? "Yes" : "No"}</td>
                  <td className="py-2 text-right">{canEdit && <button type="button" className="text-xs underline" onClick={() => { setError(null); setRate({ ...r, price: fromMinor(r.price), free_over: fromMinor(r.free_over), min_days: String(r.min_days), max_days: String(r.max_days) }); }}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit && <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs underline" onClick={() => { setError(null); setRate({ id: null, zone_id: z.id, name: "", description: "", price: "", free_over: "", min_days: "3", max_days: "7", cod_available: true, sort_order: z.rates.length, is_active: true }); }}><PlusIcon size={11} /> Add rate</button>}
        </Card>
      ))}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="PIN codes with restrictions">
          {canEdit && (
            <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => savePostalRule(rule), () => setRule({ postal_code: "", blocks: "all", note: "" })); }}>
              <label className="grid gap-1 text-xs text-taupe">PIN code<input value={rule.postal_code} onChange={(e) => setRule({ ...rule, postal_code: e.target.value })} inputMode="numeric" maxLength={10} className={cx(adminInput, "w-28")} required /></label>
              <label className="grid gap-1 text-xs text-taupe">Block<select value={rule.blocks} onChange={(e) => setRule({ ...rule, blocks: e.target.value as "all" | "cod" })} className={adminInput}><option value="all">All delivery</option><option value="cod">Cash on delivery only</option></select></label>
              <label className="grid flex-1 gap-1 text-xs text-taupe">Note<input value={rule.note} onChange={(e) => setRule({ ...rule, note: e.target.value })} maxLength={200} className={cx(adminInput, "min-w-32")} /></label>
              <Button type="submit" size="sm" busy={pending}>Add</Button>
            </form>
          )}
          {rules.length === 0 ? <p className="text-sm text-stone">Every PIN code a zone covers can order.</p> : (
            <ul className="grid gap-1 text-sm">
              {rules.map((r) => (
                <li key={r.postal_code} className="flex items-center gap-3 border-t border-black/5 py-1.5">
                  <span className="font-mono">{r.postal_code}</span>
                  <Badge tone={r.blocks === "all" ? "red" : "amber"}>{r.blocks === "all" ? "No delivery" : "No COD"}</Badge>
                  <span className="flex-1 truncate text-xs text-stone">{r.note}</span>
                  {canEdit && <button type="button" aria-label={`Remove ${r.postal_code}`} onClick={() => run(() => deletePostalRule(r.postal_code))} className="text-stone hover:text-red-700"><TrashIcon size={14} /></button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Couriers" actions={canEdit && <button type="button" className="text-xs underline" onClick={() => { setError(null); setProvider({ id: null, name: "", tracking_url_template: "", is_active: true }); }}>Add courier</button>}>
          <ul className="grid gap-1 text-sm">
            {providers.map((p) => (
              <li key={p.id} className={cx("flex items-center gap-3 border-t border-black/5 py-1.5 first:border-0", !p.is_active && "text-stone")}>
                <span className="flex-1">{p.name}{p.tracking_url_template && <span className="block truncate text-xs text-stone">{p.tracking_url_template}</span>}</span>
                {!p.is_active && <Badge>Off</Badge>}
                {canEdit && <button type="button" className="text-xs underline" onClick={() => { setError(null); setProvider({ ...p }); }}>Edit</button>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone">Tracking links use {"{tracking}"} for the tracking number, so customers get a working link when you mark an order shipped.</p>
        </Card>
      </div>

      <Dialog open={!!zone} onClose={() => setZone(null)} side="right" size="md" title={zone?.id ? `Edit ${zone.name}` : "New zone"} className="bg-white"
        footer={<div className="flex items-center gap-2">{zone?.id && <button type="button" className="text-sm text-red-700 underline" onClick={() => window.confirm("Delete this zone and its rates?") && run(() => deleteShippingRow("shipping_zones", zone.id!), () => setZone(null))}>Delete</button>}<div className="ml-auto flex gap-2"><Button size="sm" variant="ghost" onClick={() => setZone(null)}>Cancel</Button><Button size="sm" busy={pending} onClick={() => zone && run(() => saveZone(zone), () => setZone(null))}>Save</Button></div></div>}>
        {zone && (
          <div className="grid gap-4 p-5">
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <TextField label="Name" value={zone.name} onChange={(e) => setZone({ ...zone, name: e.target.value })} maxLength={80} placeholder="Metro cities" autoFocus />
            <ChipsInput id="zone-states" label="States (leave empty for all of India)" values={zone.states} onChange={(v) => setZone({ ...zone, states: v })} suggestions={states} maxLength={60} placeholder="Karnataka" />
            <ChipsInput id="zone-pins" label="PIN code prefixes (optional, most specific)" values={zone.postal_prefixes} onChange={(v) => setZone({ ...zone, postal_prefixes: v.map((x) => x.replace(/\D/g, "")).filter(Boolean) })} max={500} maxLength={6} placeholder="560, 110" />
            <TextField label="Priority" type="number" value={zone.priority} onChange={(e) => setZone({ ...zone, priority: Number(e.target.value) || 0 })} hint="When two zones match equally, the higher priority wins." />
            <Toggle label="Cash on delivery available in this zone" checked={zone.cod_available} onChange={(v) => setZone({ ...zone, cod_available: v })} />
            <Toggle label="Active" checked={zone.is_active} onChange={(v) => setZone({ ...zone, is_active: v })} />
          </div>
        )}
      </Dialog>

      <Dialog open={!!rate} onClose={() => setRate(null)} side="right" size="md" title={rate?.id ? `Edit ${rate.name}` : "New rate"} className="bg-white"
        footer={<div className="flex items-center gap-2">{rate?.id && <button type="button" className="text-sm text-red-700 underline" onClick={() => window.confirm("Delete this rate?") && run(() => deleteShippingRow("shipping_rates", rate.id!), () => setRate(null))}>Delete</button>}<div className="ml-auto flex gap-2"><Button size="sm" variant="ghost" onClick={() => setRate(null)}>Cancel</Button><Button size="sm" busy={pending} onClick={() => {
          if (!rate) return;
          const price = rate.price.trim() ? toMinor(rate.price) : 0;
          if (price === null) return setError("Enter the price in rupees.");
          run(() => saveRate({ ...rate, price, free_over: rate.free_over.trim() ? toMinor(rate.free_over) : null, min_days: Number(rate.min_days) || 0, max_days: Number(rate.max_days) || 0 }), () => setRate(null));
        }}>Save</Button></div></div>}>
        {rate && (
          <div className="grid gap-4 p-5">
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <TextField label="Name" value={rate.name} onChange={(e) => setRate({ ...rate, name: e.target.value })} maxLength={80} placeholder="Standard" autoFocus />
            <TextField label="Description" value={rate.description} onChange={(e) => setRate({ ...rate, description: e.target.value })} maxLength={200} placeholder="Tracked delivery" />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Price (₹)" value={rate.price} onChange={(e) => setRate({ ...rate, price: e.target.value })} inputMode="decimal" placeholder="0 for free" />
              <TextField label="Free over (₹)" value={rate.free_over} onChange={(e) => setRate({ ...rate, free_over: e.target.value })} inputMode="decimal" placeholder="Never" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Fastest (days)" value={rate.min_days} onChange={(e) => setRate({ ...rate, min_days: e.target.value })} inputMode="numeric" />
              <TextField label="Slowest (days)" value={rate.max_days} onChange={(e) => setRate({ ...rate, max_days: e.target.value })} inputMode="numeric" />
            </div>
            <Toggle label="Allow cash on delivery with this rate" checked={rate.cod_available} onChange={(v) => setRate({ ...rate, cod_available: v })} />
            <Toggle label="Active" checked={rate.is_active} onChange={(v) => setRate({ ...rate, is_active: v })} />
          </div>
        )}
      </Dialog>

      <Dialog open={!!provider} onClose={() => setProvider(null)} side="right" size="sm" title={provider?.id ? `Edit ${provider.name}` : "New courier"} className="bg-white"
        footer={<div className="flex items-center gap-2">{provider?.id && <button type="button" className="text-sm text-red-700 underline" onClick={() => window.confirm("Delete this courier?") && run(() => deleteShippingRow("shipping_providers", provider.id!), () => setProvider(null))}>Delete</button>}<div className="ml-auto flex gap-2"><Button size="sm" variant="ghost" onClick={() => setProvider(null)}>Cancel</Button><Button size="sm" busy={pending} onClick={() => provider && run(() => saveProvider(provider), () => setProvider(null))}>Save</Button></div></div>}>
        {provider && (
          <div className="grid gap-4 p-5">
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <TextField label="Name" value={provider.name} onChange={(e) => setProvider({ ...provider, name: e.target.value })} maxLength={80} autoFocus />
            <TextField label="Tracking link" value={provider.tracking_url_template} onChange={(e) => setProvider({ ...provider, tracking_url_template: e.target.value })} placeholder="https://courier.example/track?awb={tracking}" hint="Optional. {tracking} is replaced with the tracking number." />
            <Toggle label="Active" checked={provider.is_active} onChange={(v) => setProvider({ ...provider, is_active: v })} />
          </div>
        )}
      </Dialog>
    </div>
  );
}
