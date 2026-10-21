import "server-only";

// Server-only secrets. Importing this file from client code fails the build, so these
// values can never be bundled for the browser.

export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";
/** Only for tests: point the Razorpay client at a local mock. Live keys always use Razorpay. */
export const RAZORPAY_API_BASE = (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "").startsWith("rzp_live_")
  ? "https://api.razorpay.com"
  : (process.env.RAZORPAY_API_BASE || "https://api.razorpay.com").replace(/\/$/, "");

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
export const STRIPE_API_BASE = STRIPE_SECRET_KEY.startsWith("sk_live_")
  ? "https://api.stripe.com"
  : (process.env.STRIPE_API_BASE || "https://api.stripe.com").replace(/\/$/, "");

export const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
export const RESEND_API_BASE = (process.env.RESEND_API_BASE || "https://api.resend.com").replace(/\/$/, "");
export const EMAIL_FROM = process.env.EMAIL_FROM || "";

/** Shiprocket API user (Settings > API in Shiprocket) and the token its webhook sends. */
export const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL || "";
export const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD || "";
export const SHIPROCKET_WEBHOOK_TOKEN = process.env.SHIPROCKET_WEBHOOK_TOKEN || "";
/** Only for tests: a local mock. Any other host is ignored so credentials only ever go to Shiprocket. */
export const SHIPROCKET_API_BASE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(process.env.SHIPROCKET_API_BASE || "")
  ? process.env.SHIPROCKET_API_BASE!.replace(/\/$/, "")
  : "https://apiv2.shiprocket.in";

/** WhatsApp Business Platform (Cloud API): a permanent access token and the sending number's id. */
export const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
export const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
export const WHATSAPP_API_VERSION = /^v\d+\.\d+$/.test(process.env.WHATSAPP_API_VERSION || "") ? process.env.WHATSAPP_API_VERSION! : "v23.0";
/** Only for tests: a local mock. Any other host is ignored so the token only ever goes to Meta. */
export const WHATSAPP_API_BASE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(process.env.WHATSAPP_API_BASE || "")
  ? process.env.WHATSAPP_API_BASE!.replace(/\/$/, "")
  : "https://graph.facebook.com";

/**
 * MSG91 sends sign-in codes by SMS: an auth key and the id of the MSG91 SMS template (linked
 * to the store's DLT-approved template) whose code variable is named ##otp##.
 */
export const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || "";
export const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID || "";
/** Only for tests: a local mock. Any other host is ignored so the key only ever goes to MSG91. */
export const MSG91_API_BASE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(process.env.MSG91_API_BASE || "")
  ? process.env.MSG91_API_BASE!.replace(/\/$/, "")
  : "https://control.msg91.com";

/**
 * Supabase signs its calls to the Send SMS hook with this ("v1,whsec_..." from Authentication
 * > Hooks). The secret in supabase/config.toml is public, so it is only accepted while the
 * app uses a local Supabase.
 */
const LOCAL_SMS_HOOK_SECRET = "v1,whsec_dGFhbmEtbG9jYWwtZGV2ZWxvcG1lbnQtc21zLWhvb2s=";
const LOCAL_SUPABASE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
export const SMS_HOOK_SECRET =
  process.env.SUPABASE_SMS_HOOK_SECRET === LOCAL_SMS_HOOK_SECRET && !LOCAL_SUPABASE ? "" : process.env.SUPABASE_SMS_HOOK_SECRET || "";

/** Signs guest order links and the guest cart cookie. Falls back to the service key. */
export const LINK_SECRET = process.env.ORDER_LINK_SECRET || SUPABASE_SERVICE_ROLE_KEY;

/** Vercel Cron sends this as a bearer token. */
export const CRON_SECRET = process.env.CRON_SECRET || "";
