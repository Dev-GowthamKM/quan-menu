import "server-only";
import { formatMoney } from "./money";
import { orderUrl } from "./order-link";
import { WHATSAPP_API_BASE, WHATSAPP_API_VERSION, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN } from "./server-env";
import { supabaseService } from "./supabase/admin";
import type { OrderDetail, Tables } from "./types";
import { isWhatsAppEvent, templateParams, waNumber, type TemplateSetting } from "./whatsapp-format";

// Sends queued WhatsApp messages through the WhatsApp Business Platform (Cloud API). Order
// updates are business-initiated, so each one uses a template the store had approved in
// WhatsApp Manager; Settings › WhatsApp maps store events to those templates.

export const whatsappConfigured = () => !!(WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID);

export class WhatsAppError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

type Component = { type: string; sub_type?: string; index?: string; parameters: { type: "text"; text: string }[] };

async function postTemplate(to: string, template: TemplateSetting, components: Component[], timeoutMs: number) {
  const res = await fetch(`${WHATSAPP_API_BASE}/${WHATSAPP_API_VERSION}/${encodeURIComponent(WHATSAPP_PHONE_NUMBER_ID)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: template.name, language: { code: template.language || "en" }, ...(components.length ? { components } : {}) },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number; error_data?: { details?: string } } };
  if (!res.ok || !body.messages?.[0]?.id) {
    const e = body.error;
    throw new WhatsAppError(e?.error_data?.details || e?.message || `WhatsApp returned ${res.status}`, e?.code);
  }
  return body.messages[0].id;
}

/** Sends one template message. Returns WhatsApp's message id. */
export async function sendTemplate(to: string, template: TemplateSetting, params: string[]) {
  const components: Component[] = params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [];
  return postTemplate(to, template, components, 10_000);
}

/**
 * Sends a one-time code with an Authentication template that has a copy-code button.
 * WhatsApp needs the code twice: in the text and behind the button.
 */
export async function sendAuthCode(to: string, template: TemplateSetting, code: string) {
  return postTemplate(
    to,
    template,
    [
      { type: "body", parameters: [{ type: "text", text: code }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
    ],
    3_500,
  );
}

function values(detail: OrderDetail, data: Record<string, unknown>) {
  const o = detail.order;
  const link = orderUrl(o.order_number, o.id);
  return {
    firstName: (o.customer_name || "there").split(" ")[0],
    orderNumber: o.order_number,
    orderTotal: formatMoney(o.grand_total, o.currency),
    orderLink: link,
    carrier: String(data.carrier ?? ""),
    trackingNumber: String(data.tracking_number ?? ""),
    trackingLink: String(data.tracking_url ?? ""),
    refundAmount: data.refund_amount ? formatMoney(Number(data.refund_amount), o.currency) : "",
    returnStatus: String(data.return_status ?? "").replace(/_/g, " "),
  };
}

/** Sends queued WhatsApp messages. Safe to call from many places at once. */
export async function processWhatsapp(limit = 20) {
  const sb = supabaseService();
  const { data: rows, error } = await sb.rpc("claim_whatsapp_outbox", { p_limit: limit });
  if (error) {
    console.error("[whatsapp] claim failed:", error.message);
    return { sent: 0, failed: 0, skipped: 0 };
  }
  const counts = { sent: 0, failed: 0, skipped: 0 };
  if (!rows?.length) return counts;
  const { data: settings } = await sb.from("store_settings").select("whatsapp_enabled, whatsapp_templates").eq("id", 1).single();
  const templates = (settings?.whatsapp_templates ?? {}) as unknown as Record<string, TemplateSetting>;
  const skip = async (id: string, reason: string) => {
    await sb.from("whatsapp_outbox").update({ status: "skipped", last_error: reason }).eq("id", id);
    counts.skipped++;
  };
  for (const row of rows as Tables<"whatsapp_outbox">[]) {
    try {
      const template = templates[row.template];
      if (!whatsappConfigured()) {
        await skip(row.id, "WhatsApp isn't connected (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID).");
        continue;
      }
      if (!settings?.whatsapp_enabled || !template?.name || !isWhatsAppEvent(row.template)) {
        await skip(row.id, "WhatsApp messages for this event are turned off.");
        continue;
      }
      const to = waNumber(row.to_phone);
      if (!to) {
        await skip(row.id, "The phone number isn't a mobile number WhatsApp can reach.");
        continue;
      }
      if (!row.order_id) throw new Error("Message has no order");
      const { data: detail, error: dErr } = await sb.rpc("order_detail", { p_order_id: row.order_id });
      if (dErr || !detail) throw new Error(dErr?.message || "Order not found");
      const d = detail as unknown as OrderDetail;
      if (!d.order.whatsapp_opt_in) {
        await skip(row.id, "The customer turned WhatsApp updates off.");
        continue;
      }
      const id = await sendTemplate(to, template, templateParams(row.template, values(d, (row.data ?? {}) as Record<string, unknown>)));
      await sb.from("whatsapp_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: id, last_error: null }).eq("id", row.id);
      counts.sent++;
    } catch (e) {
      console.error("[whatsapp] send failed:", (e as Error).message);
      await sb.from("whatsapp_outbox").update({ status: "failed", last_error: String((e as Error).message).slice(0, 500) }).eq("id", row.id);
      counts.failed++;
    }
  }
  return counts;
}
