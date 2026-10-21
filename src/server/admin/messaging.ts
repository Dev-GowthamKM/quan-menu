"use server";
import { randomInt } from "node:crypto";
import { AccessError, requireRole } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { msg91Configured, sendCodeBy, type LoginCodeChannel } from "@/lib/login-codes";
import { formatIndianMobile, indianMobile } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
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

/**
 * Settings › Sign-in "Send a test code": sends a made-up code the way customers would get
 * theirs, with the settings on screen (saved or not), to check MSG91 or the WhatsApp template.
 */
export async function sendLoginCodeTest(
  phone: string,
  setup: { channel: LoginCodeChannel; template: string; language: string },
): Promise<ActionResult<null>> {
  try {
    await requireRole("admin");
  } catch (e) {
    if (e instanceof AccessError) return fail("Only admins can do this.");
    throw e;
  }
  const to = indianMobile(phone);
  if (!to) return fail("Enter an Indian mobile number, for example 98450 12345.");
  if (setup.channel === "whatsapp") {
    if (!whatsappConfigured()) return fail("Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server first.");
    if (!/^[a-z0-9_]+$/.test(setup.template)) return fail("Enter the template's name first.");
  } else if (!msg91Configured()) {
    return fail("Set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID on the server first.");
  }
  if (!(await rateLimit("login-code-test", 10, 3600))) return fail("That's a lot of test codes. Try again in an hour.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  try {
    await sendCodeBy(setup.channel, to, code, {
      phone_login_channel: setup.channel,
      whatsapp_login_template: setup.template,
      whatsapp_login_language: /^[a-z]{2,3}(_[A-Z]{2})?$/.test(setup.language) ? setup.language : "en",
    });
    return ok(null, `Sent the test code ${code} to ${formatIndianMobile(to)} ${setup.channel === "whatsapp" ? "on WhatsApp" : "by SMS"}.`);
  } catch (e) {
    const message = (e as Error).message;
    return fail(setup.channel === "whatsapp" ? `WhatsApp: ${message}` : message.startsWith("MSG91") ? message : "Couldn't reach MSG91.");
  }
}
