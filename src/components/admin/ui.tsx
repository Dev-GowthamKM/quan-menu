// Building blocks for admin pages: dense, readable and consistent.
import Link from "next/link";
import type { ReactNode } from "react";
import type { FulfillmentStatus, OrderStatus, PaymentStatus } from "@/lib/types";
import { FULFILLMENT_STATUS, ORDER_STATUS, PAYMENT_STATUS } from "@/lib/types-ui";
import { Badge, cx } from "../ui/controls";
import { ChevronLeft, ChevronRight } from "../ui/icons";

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-taupe hover:text-ink">
          <ChevronLeft size={14} /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-taupe">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx("rounded-lg border border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={padded ? "p-4" : undefined}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warn" | "bad" | "good" }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <p className="text-xs font-medium text-taupe">{label}</p>
      <p className={cx("mt-1.5 text-2xl font-semibold tabular-nums", tone === "warn" && "text-amber-700", tone === "bad" && "text-red-700", tone === "good" && "text-emerald-700")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-stone">{hint}</p>}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-lg border border-black/10 bg-white", className)}>
      <table className="w-full min-w-max border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className, ...rest }: React.ComponentProps<"th">) {
  return (
    <th scope="col" className={cx("border-b border-black/10 bg-[#fafaf9] px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-taupe", className)} {...rest}>
      {children}
    </th>
  );
}

export function Td({ children, className, ...rest }: React.ComponentProps<"td">) {
  return (
    <td className={cx("border-b border-black/5 px-3 py-2.5 align-middle", className)} {...rest}>
      {children}
    </td>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-black/15 bg-white px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-taupe">{children}</div>}
    </div>
  );
}

export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-3 text-xs text-stone">{total} {total === 1 ? "result" : "results"}</p>;
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <p className="text-xs text-stone">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={href(page - 1)} className="grid size-8 place-items-center rounded border border-black/10 bg-white hover:border-black/30" aria-label="Previous page"><ChevronLeft size={14} /></Link>
        ) : (
          <span className="grid size-8 place-items-center rounded border border-black/5 text-stone/50"><ChevronLeft size={14} /></span>
        )}
        <span className="px-2 text-xs text-taupe">Page {page} of {pages}</span>
        {page < pages ? (
          <Link href={href(page + 1)} className="grid size-8 place-items-center rounded border border-black/10 bg-white hover:border-black/30" aria-label="Next page"><ChevronRight size={14} /></Link>
        ) : (
          <span className="grid size-8 place-items-center rounded border border-black/5 text-stone/50"><ChevronRight size={14} /></span>
        )}
      </div>
    </div>
  );
}

export function OrderBadges({ status, payment, fulfillment }: { status: OrderStatus; payment: PaymentStatus; fulfillment?: FulfillmentStatus }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={ORDER_STATUS[status].tone}>{ORDER_STATUS[status].label}</Badge>
      <Badge tone={PAYMENT_STATUS[payment].tone}>{PAYMENT_STATUS[payment].label}</Badge>
      {fulfillment && status !== "cancelled" && <Badge tone={FULFILLMENT_STATUS[fulfillment].tone}>{FULFILLMENT_STATUS[fulfillment].label}</Badge>}
    </span>
  );
}

/** A GET search/filter bar: state lives in the URL so admin views are shareable. */
export function FilterBar({ children, action }: { children: ReactNode; action: string }) {
  return (
    <form action={action} className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-black/10 bg-white p-3">
      {children}
      <button type="submit" className="h-9 rounded-md bg-ink px-4 text-sm text-white hover:bg-ink/85">Apply</button>
      <Link href={action} className="h-9 px-2 text-sm leading-9 text-taupe hover:text-ink">Reset</Link>
    </form>
  );
}

export const adminInput = "h-9 rounded-md border border-black/15 bg-white px-2.5 text-sm focus:border-ink focus:outline-none";

export function sp(params: Record<string, string | string[] | undefined>, key: string) {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function pageOf(params: Record<string, string | string[] | undefined>) {
  return Math.max(1, parseInt(sp(params, "page"), 10) || 1);
}

export function withParams(base: string, params: Record<string, string | string[] | undefined>, changes: Record<string, string | number | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v) q.set(k, v);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") q.delete(k);
    else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
