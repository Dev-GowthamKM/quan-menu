"use client";
import { useState, useTransition } from "react";
import { bookCourier, cancelCourier, courierLabel, courierOptions, markReturnedToOrigin, refreshTracking, scheduleCourierPickup, type CourierChoice } from "@/server/admin/courier";
import { formatDate, formatDateTime } from "@/lib/format";
import type { CourierScan, FulfillmentStatus } from "@/lib/types";
import { Button, cx } from "../../ui/controls";
import { ExternalIcon, PrintIcon, TruckIcon } from "../../ui/icons";
import { useToast } from "../Toaster";
import { adminInput } from "../ui";
import { useAction } from "./useAction";

export interface CourierBooking {
  carrier: string;
  awb: string;
  trackingUrl: string;
  status: string;
  pickupAt: string | null;
  estimatedDelivery: string | null;
  courierStatus: string;
  courierStatusAt: string | null;
  events: CourierScan[];
}

/** Shiprocket booking, label, pickup and tracking for one order, inside the fulfilment card. */
export function CourierSection({ orderId, orderNumber, open, fulfillment, enabled, booking }: {
  orderId: string;
  orderNumber: string;
  open: boolean;
  fulfillment: FulfillmentStatus;
  enabled: boolean;
  booking: CourierBooking | null;
}) {
  const { pending, run } = useAction();
  const toast = useToast();
  const [loading, startLoading] = useTransition();
  const [form, setForm] = useState<null | { couriers: CourierChoice[]; courierId: string; weight: string; length: string; breadth: string; height: string }>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [allScans, setAllScans] = useState(false);
  const canBook = enabled && open && ["unfulfilled", "processing", "packed"].includes(fulfillment) && !booking;

  const startBooking = () =>
    startLoading(async () => {
      const res = await courierOptions(orderId);
      if (!res.ok) return toast(res.error, "error");
      const { couriers, parcel, preferredId } = res.data;
      if (couriers.length === 0) return toast("No Shiprocket courier serves this PIN code for this order.", "error");
      setForm({ couriers, courierId: preferredId ? String(preferredId) : "", weight: String(parcel.weightKg), length: String(parcel.length), breadth: String(parcel.breadth), height: String(parcel.height) });
    });

  const getLabel = () =>
    startLoading(async () => {
      const res = await courierLabel(orderId);
      if (!res.ok) return toast(res.error, "error");
      setLabel(res.data.url);
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });

  const scans = booking?.events ?? [];

  return (
    <div className="mt-4 border-t border-black/10 pt-4">
      {booking ? (
        <div className="grid gap-2 text-sm">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <TruckIcon size={16} className="shrink-0" />
            <span className="font-medium">Shiprocket{booking.carrier && ` · ${booking.carrier}`}</span>
            {booking.awb && <span>AWB <span className="font-mono">{booking.awb}</span></span>}
            {booking.trackingUrl && <a href={booking.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">Track <ExternalIcon size={11} /></a>}
          </p>
          <p className="text-xs text-taupe">
            {booking.awb ? (booking.pickupAt ? `Pickup ${formatDate(booking.pickupAt)}` : "Pickup not scheduled yet") : "Booking started: no AWB yet"}
            {booking.estimatedDelivery && ` · expected by ${formatDate(booking.estimatedDelivery)}`}
          </p>
          {booking.courierStatus && (
            <p className="text-xs">Courier status: <span className="font-medium">{booking.courierStatus}</span>{booking.courierStatusAt && <span className="text-stone"> · {formatDateTime(booking.courierStatusAt)}</span>}</p>
          )}
          {scans.length > 0 && (
            <div>
              <ol className="mt-1 grid gap-1 border-l border-black/10 pl-3 text-xs" aria-label="Tracking scans">
                {(allScans ? scans : scans.slice(0, 3)).map((s, i) => (
                  <li key={`${s.at}-${i}`}><span className="text-stone">{formatDateTime(s.at)}</span> · {s.status}{s.location && <span className="text-taupe"> · {s.location}</span>}</li>
                ))}
              </ol>
              {scans.length > 3 && <button type="button" className="mt-1 text-xs underline" onClick={() => setAllScans(!allScans)}>{allScans ? "Show fewer" : `Show all ${scans.length} scans`}</button>}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            {booking.awb && <Button size="sm" variant="secondary" busy={loading} onClick={getLabel}><PrintIcon size={13} /> Shipping label</Button>}
            {booking.awb && !booking.pickupAt && booking.status === "packed" && <Button size="sm" variant="secondary" busy={pending} onClick={() => run(() => scheduleCourierPickup(orderId, orderNumber))}>Schedule pickup</Button>}
            {!booking.awb && open && <Button size="sm" busy={loading || pending} onClick={startBooking}>Finish booking…</Button>}
            {booking.awb && <Button size="sm" variant="ghost" busy={pending} onClick={() => run(() => refreshTracking(orderId, orderNumber))}>Refresh tracking</Button>}
            {booking.status === "packed" && (
              <Button size="sm" variant="ghost" busy={pending} onClick={() => window.confirm("Cancel this courier booking? The AWB will be cancelled at Shiprocket.") && run(() => cancelCourier(orderId, orderNumber))}>Cancel booking</Button>
            )}
          </div>
          {label && <a href={label} target="_blank" rel="noreferrer" className="text-xs underline">Open the label (PDF)</a>}
        </div>
      ) : canBook ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="secondary" busy={loading} onClick={startBooking}><TruckIcon size={14} /> Book courier…</Button>
          <span className="text-xs text-stone">Shiprocket assigns the AWB, prints the label and schedules the pickup.</span>
        </div>
      ) : null}

      {form && (
        <form
          className="mt-4 grid gap-3 rounded-md border border-black/10 bg-black/[0.02] p-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const n = (v: string) => Number(v.replace(",", "."));
            run(
              () => bookCourier({
                orderId, orderNumber, courierId: form.courierId ? Number(form.courierId) : null,
                weightKg: n(form.weight), length: n(form.length), breadth: n(form.breadth), height: n(form.height),
              }),
              () => setForm(null),
            );
          }}
        >
          <label className="grid gap-1 text-xs font-medium text-taupe sm:col-span-4">
            Courier
            <select value={form.courierId} onChange={(e) => setForm({ ...form, courierId: e.target.value })} className={adminInput}>
              <option value="">Shiprocket&apos;s recommendation</option>
              {form.couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · ₹{c.rate.toFixed(2)}{c.days ? ` · ${c.days} ${c.days === 1 ? "day" : "days"}` : ""}{c.recommended ? " · recommended" : ""}
                </option>
              ))}
            </select>
          </label>
          {([["weight", "Weight (kg)"], ["length", "Length (cm)"], ["breadth", "Width (cm)"], ["height", "Height (cm)"]] as const).map(([k, l]) => (
            <label key={k} className="grid gap-1 text-xs font-medium text-taupe">
              {l}
              <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} inputMode="decimal" required className={cx(adminInput, "tabular-nums")} />
            </label>
          ))}
          <div className="flex gap-2 sm:col-span-4">
            <Button type="submit" size="sm" busy={pending}>Book courier</Button>
            <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </form>
      )}

      {open && fulfillment === "shipped" && (
        <p className="mt-3 text-xs text-stone">
          Parcel came back undelivered?{" "}
          <button
            type="button"
            className="underline"
            disabled={pending}
            onClick={() => {
              const note = window.prompt("Mark this order as returned to origin (RTO)? Its stock goes back on sale and an unpaid cash-on-delivery order is cancelled. Add a note (optional):", "");
              if (note !== null) run(() => markReturnedToOrigin(orderId, orderNumber, note));
            }}
          >
            Mark returned to origin
          </button>
        </p>
      )}
    </div>
  );
}
