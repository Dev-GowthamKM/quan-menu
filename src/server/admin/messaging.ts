"use server";
import { AccessError, requireRole } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { sendTemplate, whatsappConfigured, WhatsAppError } from "@/lib/whatsapp";
import { waNumber } from "@/lib/whatsapp-format";

/**
 * Settings › WhatsApp "Send a test": sends Meta's ready-made hello_world template, which
 * every WhatsApp Business account has, to check the token and phone number id.
 */
export async function sendWhatsappTest(phone: string): Promise<ActionResult<null>> {
  try {
    await requireRole("admin");
  } catch (e) {
    if (e instanceof AccessError) return fail("Only admins can do this.");
    throw e;
  }
  if (!whatsappConfigured()) return fail("Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server first.");
  const to = waNumber(phone);
  if (!to) return fail("Enter a mobile number, for example +91 98450 12345.");
  try {
    await sendTemplate(to, { name: "hello_world", language: "en_US" }, []);
    return ok(null, "Test message sent. It should arrive on WhatsApp in a few seconds.");
  } catch (e) {
    return fail(e instanceof WhatsAppError ? `WhatsApp: ${e.message}` : "Couldn't reach WhatsApp.");
  }
}
