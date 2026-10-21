import "server-only";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { indianMobile, maskMobile } from "./phone";
import { rateLimit } from "./rate-limit";
import { MSG91_API_BASE, MSG91_AUTH_KEY, MSG91_TEMPLATE_ID, SMS_HOOK_SECRET } from "./server-env";
import { supabaseService } from "./supabase/admin";
import { sendAuthCode, whatsappConfigured } from "./whatsapp";

// Sign-in codes for "Continue with mobile number". Supabase Auth makes the code and checks
// it; its Send SMS hook (/api/auth/sms) hands the code to deliverLoginCode, which sends it
// by SMS through MSG91, or on WhatsApp when the store chose that in Settings › Sign-in.

export type LoginCodeChannel = "sms" | "whatsapp";

export const msg91Configured = () => !!(MSG91_AUTH_KEY && MSG91_TEMPLATE_ID);

/** Sends the code by SMS with the store's MSG91 template. Returns MSG91's request id. */
export async function sendMsg91Code(to: string, code: string) {
  const res = await fetch(`${MSG91_API_BASE}/api/v5/flow`, {
    method: "POST",
    headers: { authkey: MSG91_AUTH_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ template_id: MSG91_TEMPLATE_ID, short_url: "0", recipients: [{ mobiles: to, otp: code }] }),
    cache: "no-store",
    signal: AbortSignal.timeout(3_500),
  });
  // MSG91 answers 200 to some failures too; only "type": "success" means it was accepted.
  const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
  if (!res.ok || body.type !== "success") throw new Error(`MSG91: ${body.message || `HTTP ${res.status}`}`);
  return String(body.message ?? "");
}

interface ChannelSettings {
  phone_login_channel: string;
  whatsapp_login_template: string;
  whatsapp_login_language: string;
}

/** The channel the store's settings pick, if it is set up; WhatsApp falls back to SMS. */
export function chooseChannel(s: ChannelSettings): LoginCodeChannel | null {
  if (s.phone_login_channel === "whatsapp" && whatsappConfigured() && s.whatsapp_login_template) return "whatsapp";
  return msg91Configured() ? "sms" : null;
}

/** How sign-in codes are sent when signing in with a mobile number is on and set up, else null. */
export function phoneSignInChannel(s: ChannelSettings & { phone_login_enabled: boolean }): LoginCodeChannel | null {
  return s.phone_login_enabled && SMS_HOOK_SECRET ? chooseChannel(s) : null;
}

export async function sendCodeBy(channel: LoginCodeChannel, to: string, code: string, s: ChannelSettings) {
  return channel === "whatsapp"
    ? sendAuthCode(to, { name: s.whatsapp_login_template, language: s.whatsapp_login_language || "en" }, code)
    : sendMsg91Code(to, code);
}

export interface AuthProviderStatus {
  /** Phone sign-in is on in Supabase (Authentication › Sign In / Providers › Phone). */
  phone: boolean;
  /** "Confirm phone": off would let anyone register someone else's number with a password. */
  confirmations: boolean;
}

let authStatusCache: { at: number; value: AuthProviderStatus | null } | null = null;

/** Supabase Auth's public settings, cached for a minute. Null when they can't be read. */
export async function authProviderStatus(fresh = false): Promise<AuthProviderStatus | null> {
  if (!fresh && authStatusCache && Date.now() - authStatusCache.at < 60_000) return authStatusCache.value;
  let value: AuthProviderStatus | null = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY }, cache: "no-store", signal: AbortSignal.timeout(2_500) });
    if (res.ok) {
      const body = (await res.json()) as { external?: { phone?: boolean }; phone_autoconfirm?: boolean };
      value = { phone: !!body.external?.phone, confirmations: body.phone_autoconfirm === false };
    }
  } catch (e) {
    console.error("[login-codes] could not read Supabase Auth settings:", (e as Error).message);
  }
  authStatusCache = { at: Date.now(), value };
  return value;
}

export type DeliveryResult = { ok: true; sent: boolean; channel?: LoginCodeChannel } | { ok: false; status: number; message: string };

const unavailable = (why: string): DeliveryResult => {
  console.error(`[login-codes] ${why}`);
  return { ok: false, status: 503, message: "Sign-in codes can't be sent right now. Please sign in with your email instead." };
};

/**
 * Delivers a code Supabase Auth generated for `phone` (sign-in, sign-up, or adding a number
 * to an account). Every rule is enforced here, because anyone can ask Supabase Auth for a
 * code directly: Indian mobile numbers only, the store's switch, a limit per number, and
 * never to staff accounts, which sign in with email and password.
 */
export async function deliverLoginCode(input: { phone: string; code: string; userId: string | null }): Promise<DeliveryResult> {
  const to = indianMobile(input.phone);
  if (!to) return { ok: false, status: 400, message: "Enter an Indian mobile number (10 digits, starting with 6, 7, 8 or 9)." };
  if (!/^\d{4,10}$/.test(input.code)) return { ok: false, status: 400, message: "We couldn't create a code. Please try again." };
  if (!SMS_HOOK_SECRET) return unavailable("SUPABASE_SMS_HOOK_SECRET is not set.");

  const sb = supabaseService();
  const { data: s, error } = await sb
    .from("store_settings")
    .select("phone_login_enabled, phone_login_channel, whatsapp_login_template, whatsapp_login_language")
    .eq("id", 1)
    .single();
  if (error || !s) return unavailable(`could not read store settings: ${error?.message}`);
  if (!s.phone_login_enabled) return { ok: false, status: 403, message: "Signing in with a mobile number is turned off. Please use your email." };

  // With phone confirmations off, a number could be registered by someone who doesn't own
  // it; refusing to send codes means its owner can never be signed in to that account.
  const auth = await authProviderStatus();
  if (!auth) return unavailable("could not read Supabase Auth settings.");
  if (!auth.confirmations) return unavailable("phone confirmations are off in Supabase (Authentication › Sign In / Providers › Phone › Confirm phone). Turn them on.");

  if (input.userId) {
    const { data: staff } = await sb.from("user_roles").select("user_id").eq("user_id", input.userId).maybeSingle();
    if (staff) {
      // Say nothing either way, so this can't be used to find staff numbers.
      console.warn(`[login-codes] not sending a code to staff account ${input.userId}`);
      return { ok: true, sent: false };
    }
  }

  if (!(await rateLimit("login-code-hour", 5, 3600, to)) || !(await rateLimit("login-code-day", 10, 86400, to))) {
    return { ok: false, status: 429, message: "Too many codes for this number. Please try again later, or sign in with your email." };
  }

  const channel = chooseChannel(s);
  if (!channel) return unavailable("no way to send codes: set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID, or connect WhatsApp and choose a template.");
  try {
    await sendCodeBy(channel, to, input.code, s);
    return { ok: true, sent: true, channel };
  } catch (e) {
    console.error(`[login-codes] ${channel} to ${maskMobile(to)} failed:`, (e as Error).message);
    return { ok: false, status: 502, message: "We couldn't send the code. Please try again in a minute." };
  }
}
