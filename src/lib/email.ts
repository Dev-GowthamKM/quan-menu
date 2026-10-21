import "server-only";
import { formatDateTime } from "./format";
import { formatMoney } from "./money";
import { SITE_URL } from "./env";
import { orderUrl } from "./order-link";
import { EMAIL_FROM, RESEND_API_BASE, RESEND_API_KEY } from "./server-env";
import { cartRestoreUrl, oneClickUnsubscribeUrl, unsubscribeUrl } from "./signed-links";
import { getSettings } from "./settings";
import { supabaseService } from "./supabase/admin";
import type { OrderDetail, StoreSettings, Tables } from "./types";
import { processWhatsapp } from "./whatsapp";

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
  // A cash-on-delivery order waiting for the customer's confirmation asks for it first.
  const confirm = template === "order_confirmation" && o.cod_confirmation === "pending" && o.status === "confirmed";
  const subject = confirm ? `Please confirm your order ${o.order_number}` : fill(t.subject, vars);
  const body = confirm
    ? `Hi ${vars.customer_name},\n\nThank you for your order. Please confirm your cash-on-delivery order so we can start packing it.${o.cod_confirm_by ? ` Orders that aren't confirmed by ${formatDateTime(o.cod_confirm_by)} are cancelled automatically.` : ""}`
    : fill(t.body, vars);
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
    <tr><td style="padding:8px 32px 32px"><a href="${escape(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 26px;font-size:12px;letter-spacing:.14em;text-transform:uppercase">${confirm ? "Confirm your order" : "View your order"}</a></td></tr>
  </table>
  <p style="font-size:11px;color:#8a8178;margin-top:16px">Order ${escape(o.order_number)} · ${escape(settings.store_name)}</p>
  </td></tr></table></body></html>`;
  const text = `${body}\n\n${confirm ? "Confirm your order" : "View your order"}: ${link}\n`;
  return { subject, html, text };
}

// --- Reminders (not tied to an order) ------------------------------------------------

const REMINDER_FALLBACK: Record<string, Template> = {
  back_in_stock: { subject: "{{product_title}} is back in stock", body: "Good news: {{product_title}} is back in stock{{variant}}. Popular sizes go quickly, so don't wait too long." },
  cart_reminder: { subject: "You left something in your bag", body: "Hi,\n\nYou left these in your bag at {{store_name}}. We can't hold them for long, so here they are while they're still in stock." },
  price_drop: { subject: "Price drop on your wishlist", body: "Hi,\n\nGood news: pieces on your wishlist at {{store_name}} now cost less." },
};

export const REMINDER_TEMPLATES = Object.keys(REMINDER_FALLBACK);

interface ReminderItem {
  title: string;
  size?: string;
  color?: string;
  quantity?: number;
  price?: number;
  was?: number;
  now?: number;
  image_url?: string | null;
}

/** A small version of a catalog image for emails. */
function thumb(url: string | null | undefined) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  if (url.startsWith("https://images.unsplash.com/")) {
    const u = new URL(url);
    u.searchParams.set("w", "160");
    return u.toString();
  }
  return url;
}

export function renderReminder(settings: StoreSettings, template: string, to: string, data: Record<string, unknown>) {
  const templates = (settings.email_templates ?? {}) as Record<string, Template>;
  const t = templates[template]?.subject ? templates[template] : REMINDER_FALLBACK[template];
  if (!t) throw new Error(`Unknown email template ${template}`);
  const currency = settings.currency;
  const vars: Record<string, string> = { store_name: settings.store_name, product_title: "", variant: "", product_url: "", cart_url: "", wishlist_url: "" };
  let items: ReminderItem[] = [];
  let cta = { label: "Visit the store", url: SITE_URL };
  if (template === "back_in_stock") {
    const variant = [data.color, data.size ? `size ${data.size}` : ""].filter(Boolean).join(", ");
    vars.product_title = String(data.product_title ?? "");
    vars.variant = variant ? ` in ${variant}` : "";
    vars.product_url = `${SITE_URL}/products/${encodeURIComponent(String(data.slug ?? ""))}${data.color ? `?color=${encodeURIComponent(String(data.color))}` : ""}`;
    items = [{ title: vars.product_title, size: String(data.size ?? ""), color: String(data.color ?? ""), price: Number(data.price), image_url: data.image_url as string | null }];
    cta = { label: "Shop now", url: vars.product_url };
  } else if (template === "cart_reminder") {
    vars.cart_url = cartRestoreUrl(String(data.cart_id));
    items = (data.items ?? []) as ReminderItem[];
    cta = { label: "Return to your bag", url: vars.cart_url };
  } else if (template === "price_drop") {
    vars.wishlist_url = `${SITE_URL}/account/wishlist`;
    items = (data.items ?? []) as ReminderItem[];
    cta = { label: "See your wishlist", url: vars.wishlist_url };
  }
  const unsubscribe = template === "back_in_stock" ? null : unsubscribeUrl(to);
  const subject = fill(t.subject, vars);
  const body = fill(t.body, vars);
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const rows = items
    .map((i) => {
      const img = thumb(i.image_url);
      const details = [i.color, i.size ? `Size ${i.size}` : "", i.quantity ? `Qty ${i.quantity}` : ""].filter(Boolean).join(" · ");
      const price = i.now !== undefined
        ? `<span style="color:#8a8178;text-decoration:line-through">${formatMoney(i.was, currency)}</span> <strong>${formatMoney(i.now, currency)}</strong>`
        : i.price !== undefined && !Number.isNaN(i.price) ? formatMoney(i.price, currency) : "";
      return `<tr>
        <td width="72" style="padding:10px 12px 10px 0;border-bottom:1px solid #e4ddd1">${img ? `<img src="${escape(img)}" width="60" alt="" style="display:block;width:60px;height:auto">` : ""}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e4ddd1">${escape(i.title)}${details ? `<br><span style="color:#8a8178;font-size:12px">${escape(details)}</span>` : ""}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e4ddd1;text-align:right;white-space:nowrap">${price}</td>
      </tr>`;
    })
    .join("");
  const table = rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-top:8px">${rows}</table>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f3ec;font-family:Helvetica,Arial,sans-serif;color:#111">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e4ddd1">
    <tr><td style="padding:28px 32px 0;font-family:Georgia,serif;font-size:24px;letter-spacing:.18em;text-transform:uppercase">${escape(settings.store_name)}</td></tr>
    <tr><td style="padding:24px 32px 8px;font-size:15px;color:#2b2724">${paragraphs}${table}</td></tr>
    <tr><td style="padding:16px 32px 32px"><a href="${escape(cta.url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 26px;font-size:12px;letter-spacing:.14em;text-transform:uppercase">${escape(cta.label)}</a></td></tr>
  </table>
  <p style="font-size:11px;color:#8a8178;margin-top:16px">${escape(settings.store_name)}${unsubscribe ? ` · <a href="${escape(unsubscribe)}" style="color:#8a8178">Unsubscribe from reminders</a>` : ""}</p>
  </td></tr></table></body></html>`;
  const lines = items.map((i) => `- ${i.title}${i.size ? ` (size ${i.size})` : ""}`).join("\n");
  const text = `${body}\n\n${lines}\n\n${cta.label}: ${cta.url}\n${unsubscribe ? `\nUnsubscribe from reminders: ${unsubscribe}\n` : ""}`;
  return { subject, html, text, unsubscribe };
}

async function send(to: string, message: { subject: string; html: string; text: string }, headers?: Record<string, string>) {
  const res = await fetch(`${RESEND_API_BASE}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject: message.subject, html: message.html, text: message.text, ...(headers ? { headers } : {}) }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `Email provider returned ${res.status}`);
  return String(body.id ?? "");
}

/** Sends queued customer emails, then queued WhatsApp messages. Safe to call from many places at once. */
export async function processOutbox(limit = 20) {
  const emails = await processEmails(limit);
  const whatsapp = await processWhatsapp(limit).catch((e: Error) => {
    console.error("[whatsapp]", e.message);
    return { sent: 0, failed: 0, skipped: 0 };
  });
  return { ...emails, whatsapp };
}

async function processEmails(limit: number) {
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
      let id: string;
      if (row.order_id) {
        const { data: detail, error: dErr } = await sb.rpc("order_detail", { p_order_id: row.order_id });
        if (dErr || !detail) throw new Error(dErr?.message || "Order not found");
        const message = renderEmail(settings, row.template, detail as unknown as OrderDetail, (row.data ?? {}) as Record<string, unknown>);
        id = await send(row.to_email, message);
      } else {
        // Reminders: never to someone who unsubscribed after it was queued.
        const { data: suppressed } = await sb.from("email_suppressions").select("email").eq("email", row.to_email.toLowerCase()).maybeSingle();
        if (suppressed && row.template !== "back_in_stock") {
          await sb.from("email_outbox").update({ status: "skipped", last_error: "Unsubscribed from reminders." }).eq("id", row.id);
          counts.skipped++;
          continue;
        }
        const message = renderReminder(settings, row.template, row.to_email, (row.data ?? {}) as Record<string, unknown>);
        id = await send(row.to_email, message, message.unsubscribe
          ? { "List-Unsubscribe": `<${oneClickUnsubscribeUrl(row.to_email)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : undefined);
      }
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
