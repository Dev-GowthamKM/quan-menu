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

/** Signs guest order links and the guest cart cookie. Falls back to the service key. */
export const LINK_SECRET = process.env.ORDER_LINK_SECRET || SUPABASE_SERVICE_ROLE_KEY;

/** Vercel Cron sends this as a bearer token. */
export const CRON_SECRET = process.env.CRON_SECRET || "";
