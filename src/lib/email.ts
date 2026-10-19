import "server-only";
import { formatMoney } from "./money";
import { orderUrl } from "./order-link";
import { EMAIL_FROM, RESEND_API_BASE, RESEND_API_KEY } from "./server-env";
import { getSettings } from "./settings";
import { supabaseService } from "./supabase/admin";
import type { OrderDetail, StoreSettings, Tables } from "./types";

// Customer emails. Database functions queue a row in email_outbox when something
// happens (order confirmed, shipped, refunded...); processOutbox renders the store's
// editable templates and sends them through Resend. Without RESEND_API_KEY messages
// are marked "skipped", so nothing piles up and admins can see what would have gone out.

type Template = { subject: string; body: string };

const FALLBACK: Record<string, Template> = {
  order_confirmation: { subject: "Order {{order_number}} confirmed", body: "Hi {{customer_name}},\n\nThank you for your order." },
  order_shipped: { subject: "Your order {{order_number}} is on its way", body: "Hi {{customer_name}},\n\nYour order has shipped." },
  order_delivered: { subject: "Your order {{order_number}} was delivered", body: "Hi {{customer_name}},\n\nYour order was delivered." },
  order_cancelled: { subject: "Order {{order_number}} was cancelled", body: "Hi {{customer_name}},\n\nYour order has been cancelled." },
  refund_processed: { subject: "Refund for order {{order_number}}", body: "Hi {{customer_name}},\n\nWe have refunded {{refund_amount}}." },
  return_update: { subject: "Update on your return for order {{order_number}}", body: "Hi {{customer_name}},\n\nYour return request is now: {{return_status}}." },
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function fill(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}

function itemsTable(detail: OrderDetail, currency: string) {
  const rows = detail.items
    .map(
      (i) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e4ddd1">${escape(i.product_title)}<br><span style="color:#8a8178;font-size:12px">${escape(i.variant_title)} · Qty ${i.quantity}</span></td>
        <td style="padding:10px 0;border-bottom:1px solid #e4ddd1;text-align:right;white-space:nowrap">${formatMoney(i.line_total, currency)}</td>
      </tr>`,
    )
    .join("");
  const o = detail.order;
  const line = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;color:#5c544c">${label}</td><td style="padding:4px 0;text-align:right">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-top:20px">${rows}
    ${line("Subtotal", formatMoney(o.subtotal, currency))}
    ${o.discount_total ? line("Discount", `−${formatMoney(o.discount_total, currency)}`) : ""}
    ${line("Delivery", o.shipping_total ? formatMoney(o.shipping_total, currency) : "Free")}
    ${o.cod_fee ? line("Cash on delivery fee", formatMoney(o.cod_fee, currency)) : ""}
    <tr><td style="padding:8px 0;font-weight:bold">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold">${formatMoney(o.grand_total, currency)}</td></tr>
  </table>`;
}

export function renderEmail(
  settings: StoreSettings,
  template: string,
  detail: OrderDetail,
  data: Record<string, unknown>,
): { subject: string; html: string; text: string } {
  const templates = (settings.email_templates ?? {}) as Record<string, Template>;
  const t = templates[template]?.subject ? templates[template] : FALLBACK[template] ?? FALLBACK.order_confirmation;
  const o = detail.order;
  const link = orderUrl(o.order_number, o.id);
  const vars: Record<string, string> = {
    store_name: settings.store_name,
    customer_name: (o.customer_name || "there").split(" ")[0],
    order_number: o.order_number,
    order_total: formatMoney(o.grand_total, o.currency),
    order_url: link,
    carrier: String(data.carrier ?? ""),
    tracking_number: String(data.tracking_number ?? ""),
    tracking_url: String(data.tracking_url ?? ""),
    refund_amount: data.refund_amount ? formatMoney(Number(data.refund_amount), o.currency) : "",
    return_status: String(data.return_status ?? ""),
  };
  const subject = fill(t.subject, vars);
  const body = fill(t.body, vars);
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const tracking =
    template === "order_shipped" && vars.tracking_url
      ? `<p style="margin:0 0 14px"><a href="${escape(vars.tracking_url)}" style="color:#111">Track your parcel</a></p>`
      : "";
  const summary = template === "order_confirmation" ? itemsTable(detail, o.currency) : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f3ec;font-family:Helvetica,Arial,sans-serif;color:#111">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e4ddd1">
    <tr><td style="padding:28px 32px 0;font-family:Georgia,serif;font-size:24px;letter-spacing:.18em;text-transform:uppercase">${escape(settings.store_name)}</td></tr>
    <tr><td style="padding:24px 32px 8px;font-size:15px;color:#2b2724">${paragraphs}${tracking}${summary}</td></tr>
    <tr><td style="padding:8px 32px 32px"><a href="${escape(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 26px;font-size:12px;letter-spacing:.14em;text-transform:uppercase">View your order</a></td></tr>
  </table>
  <p style="font-size:11px;color:#8a8178;margin-top:16px">Order ${escape(o.order_number)} · ${escape(settings.store_name)}</p>
  </td></tr></table></body></html>`;
  const text = `${body}\n\nView your order: ${link}\n`;
  return { subject, html, text };
}

async function send(to: string, message: { subject: string; html: string; text: string }) {
  const res = await fetch(`${RESEND_API_BASE}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject: message.subject, html: message.html, text: message.text }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `Email provider returned ${res.status}`);
  return String(body.id ?? "");
}

/** Sends queued customer emails. Safe to call from many places at once. */
export async function processOutbox(limit = 20) {
  const sb = supabaseService();
  const { data: rows, error } = await sb.rpc("claim_outbox", { p_limit: limit });
  if (error) {
    console.error("[email] claim failed:", error.message);
    return { sent: 0, failed: 0, skipped: 0 };
  }
  const settings = await getSettings();
  const counts = { sent: 0, failed: 0, skipped: 0 };
  for (const row of (rows ?? []) as Tables<"email_outbox">[]) {
    try {
      if (!RESEND_API_KEY || !EMAIL_FROM) {
        await sb.from("email_outbox").update({ status: "skipped", last_error: "No email provider configured (RESEND_API_KEY, EMAIL_FROM)." }).eq("id", row.id);
        counts.skipped++;
        continue;
      }
      if (!row.order_id) throw new Error("Message has no order");
      const { data: detail, error: dErr } = await sb.rpc("order_detail", { p_order_id: row.order_id });
      if (dErr || !detail) throw new Error(dErr?.message || "Order not found");
      const message = renderEmail(settings, row.template, detail as unknown as OrderDetail, (row.data ?? {}) as Record<string, unknown>);
      const id = await send(row.to_email, message);
      await sb.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: id, last_error: null }).eq("id", row.id);
      counts.sent++;
    } catch (e) {
      console.error("[email] send failed:", (e as Error).message);
      await sb.from("email_outbox").update({ status: "failed", last_error: String((e as Error).message).slice(0, 500) }).eq("id", row.id);
      counts.failed++;
    }
  }
  return counts;
}
