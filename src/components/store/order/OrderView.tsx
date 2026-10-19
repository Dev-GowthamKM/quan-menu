import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { OrderDetail } from "@/lib/types";
import { FULFILLMENT_STATUS, ORDER_STATUS, PAYMENT_STATUS } from "@/lib/types-ui";
import CatalogImage from "../../ui/CatalogImage";
import { Badge, cx } from "../../ui/controls";
import { CheckIcon, ExternalIcon } from "../../ui/icons";
import OrderActions from "./OrderActions";
import PaymentWatcher from "./PaymentWatcher";

const STAGES = [
  { key: "placed", label: "Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
] as const;

function stageIndex(d: OrderDetail) {
  const o = d.order;
  if (o.fulfillment_status === "delivered" || o.fulfillment_status === "returned") return 4;
  if (o.fulfillment_status === "shipped") return 3;
  if (o.fulfillment_status === "packed" || o.fulfillment_status === "processing") return 2;
  if (o.status === "confirmed" || o.status === "completed") return 1;
  return 0;
}

export default function OrderView({ detail, accessKey, justPlaced, stripeSession }: { detail: OrderDetail; accessKey: string | null; justPlaced?: boolean; stripeSession?: string | null }) {
  const o = detail.order;
  const c = o.currency;
  const stage = stageIndex(detail);
  const cancelled = o.status === "cancelled";
  const awaiting = o.status === "pending_payment";
  const firstName = (o.customer_name || "").split(" ")[0];

  return (
    <div className="container-page py-10 md:py-14">
      {justPlaced && !cancelled && !awaiting && (
        <div className="mb-10 border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
          <p className="mx-auto grid size-12 place-items-center rounded-full bg-ok text-white"><CheckIcon size={24} /></p>
          <h1 className="mt-4 font-serif text-4xl">Thank you{firstName ? `, ${firstName}` : ""}</h1>
          <p className="mt-2 text-taupe">
            {o.payment_method === "cod"
              ? "Your order is confirmed. Pay when it arrives."
              : "Your payment was received and your order is confirmed."}{" "}
            A confirmation is on its way to {o.email}.
          </p>
        </div>
      )}
      {awaiting && <PaymentWatcher orderNumber={o.order_number} accessKey={accessKey} paymentStatus={o.payment_status} expiresAt={o.expires_at} stripeSession={stripeSession ?? null} />}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps text-stone">Order</p>
          <h2 className="mt-1 font-serif text-4xl">{o.order_number}</h2>
          <p className="mt-1 text-sm text-taupe">Placed {formatDateTime(o.placed_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
          <Badge tone={PAYMENT_STATUS[o.payment_status].tone}>{PAYMENT_STATUS[o.payment_status].label}</Badge>
          {!cancelled && <Badge tone={FULFILLMENT_STATUS[o.fulfillment_status].tone}>{FULFILLMENT_STATUS[o.fulfillment_status].label}</Badge>}
        </div>
      </div>

      {!cancelled && !awaiting && (
        <ol className="mt-10 grid grid-cols-5 gap-2" aria-label="Order progress">
          {STAGES.map((s, i) => (
            <li key={s.key} className="text-center">
              <div className={cx("h-1", i <= stage ? "bg-ink" : "bg-line")} />
              <p className={cx("mt-2 text-[11px] tracking-[0.1em] uppercase", i <= stage ? "text-ink" : "text-stone")} aria-current={i === stage ? "step" : undefined}>
                {s.label}
              </p>
            </li>
          ))}
        </ol>
      )}
      {cancelled && (
        <p className="mt-8 border border-line bg-paper px-5 py-4 text-sm text-taupe">
          This order was cancelled on {formatDate(o.cancelled_at)}.
          {o.payment_status === "paid" && " Your refund is being processed."}
          {(o.payment_status === "refunded" || o.payment_status === "partially_refunded") && ` ${formatMoney(o.amount_refunded, c)} has been refunded.`}
        </p>
      )}

      {detail.shipments.filter((s) => s.tracking_number || s.carrier).map((s) => (
        <div key={s.id} className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-line bg-paper px-5 py-4 text-sm">
          <p>
            <span className="text-taupe">Shipped with</span> {s.carrier || "our courier"}
            {s.tracking_number && <> · <span className="text-taupe">Tracking</span> <span className="font-medium">{s.tracking_number}</span></>}
            {s.delivered_at && <> · Delivered {formatDate(s.delivered_at)}</>}
          </p>
          {s.tracking_url && (
            <a href={s.tracking_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4">
              Track parcel <ExternalIcon size={14} />
            </a>
          )}
        </div>
      ))}

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <ul className="divide-y divide-line border-y border-line">
            {detail.items.map((i) => (
              <li key={i.id} className="flex gap-4 py-5">
                <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden bg-bone">
                  <CatalogImage src={i.image_url} alt="" fill sizes="80px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="label-caps text-stone">{i.brand_name}</p>
                  {i.product_slug ? (
                    <Link href={`/products/${i.product_slug}`} className="mt-1 block hover:underline">{i.product_title}</Link>
                  ) : (
                    <p className="mt-1">{i.product_title}</p>
                  )}
                  <p className="mt-1 text-taupe">{i.variant_title} · Qty {i.quantity}</p>
                  {i.quantity_returned > 0 && <p className="mt-1 text-xs text-stone">{i.quantity_returned} returned</p>}
                </div>
                <p className="text-sm tabular-nums">{formatMoney(i.line_total, c)}</p>
              </li>
            ))}
          </ul>

          <OrderActions detail={detail} accessKey={accessKey} />

          {detail.events.length > 0 && (
            <section className="mt-12">
              <h3 className="label-caps text-stone">Updates</h3>
              <ol className="mt-4 grid gap-4 border-l border-line pl-5">
                {[...detail.events].reverse().map((e, n) => (
                  <li key={n} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[1.4rem] size-2 rounded-full bg-ink" aria-hidden />
                    <p>{e.message}</p>
                    <p className="text-xs text-stone">{formatDateTime(e.created_at)}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="grid h-fit gap-8 bg-paper p-6 text-sm">
          <div>
            <h3 className="label-caps text-stone">Delivery address</h3>
            <p className="mt-2 leading-relaxed">
              {o.shipping_address.full_name}<br />
              {o.shipping_address.line1}{o.shipping_address.line2 ? `, ${o.shipping_address.line2}` : ""}<br />
              {o.shipping_address.landmark && <>{o.shipping_address.landmark}<br /></>}
              {o.shipping_address.city}, {o.shipping_address.state} {o.shipping_address.postal_code}<br />
              {o.shipping_address.phone}
            </p>
          </div>
          <div>
            <h3 className="label-caps text-stone">Delivery</h3>
            <p className="mt-2">{o.shipping_method?.name ?? "Standard"}</p>
          </div>
          <div>
            <h3 className="label-caps text-stone">Payment</h3>
            <p className="mt-2">{o.payment_method === "cod" ? "Cash on delivery" : o.payment_method === "stripe" ? "Card (Stripe)" : o.payment_method === "none" ? "Nothing to pay" : "Razorpay"}</p>
          </div>
          <dl className="grid gap-2 border-t border-line pt-5">
            <div className="flex justify-between"><dt className="text-taupe">Subtotal</dt><dd className="tabular-nums">{formatMoney(o.subtotal, c)}</dd></div>
            {o.discount_total > 0 && <div className="flex justify-between text-ok"><dt>Discount{o.coupon_code ? ` (${o.coupon_code})` : ""}</dt><dd className="tabular-nums">−{formatMoney(o.discount_total, c)}</dd></div>}
            <div className="flex justify-between"><dt className="text-taupe">Delivery</dt><dd className="tabular-nums">{o.shipping_total ? formatMoney(o.shipping_total, c) : "Free"}</dd></div>
            {o.cod_fee > 0 && <div className="flex justify-between"><dt className="text-taupe">Cash on delivery fee</dt><dd className="tabular-nums">{formatMoney(o.cod_fee, c)}</dd></div>}
            {o.tax_mode === "exclusive" && <div className="flex justify-between"><dt className="text-taupe">{o.tax_label}</dt><dd className="tabular-nums">{formatMoney(o.tax_total, c)}</dd></div>}
            <div className="mt-2 flex justify-between border-t border-line pt-3 text-base"><dt>Total</dt><dd className="font-medium tabular-nums">{formatMoney(o.grand_total, c)}</dd></div>
            {o.amount_refunded > 0 && <div className="flex justify-between text-violet-800"><dt>Refunded</dt><dd className="tabular-nums">−{formatMoney(o.amount_refunded, c)}</dd></div>}
          </dl>
          {o.tax_mode === "inclusive" && o.tax_total > 0 && <p className="-mt-3 text-right text-xs text-stone">Includes {formatMoney(o.tax_total, c)} {o.tax_label}</p>}
          <p className="text-xs text-stone">
            Need help with this order? <Link href={`/contact`} className="underline">Contact us</Link> and mention {o.order_number}.
          </p>
        </aside>
      </div>
    </div>
  );
}
