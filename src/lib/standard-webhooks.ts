// Standard Webhooks (standardwebhooks.com), which Supabase Auth uses to sign its calls to the
// store's Send SMS hook. Pure functions, so they can be unit tested.
import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

/** The HMAC key from a secret in Supabase's "v1,whsec_<base64>" form. */
function keyOf(secret: string): Buffer | null {
  const b64 = secret.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const key = Buffer.from(b64, "base64");
  return key.length >= 16 ? key : null;
}

/** The webhook-signature value for a message, as the sender computes it. */
export function signWebhook(secret: string, id: string, timestamp: number, body: string) {
  const key = keyOf(secret);
  if (!key) throw new Error("Invalid webhook secret.");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * True when the raw body was signed with one of the secrets (several during a rotation)
 * within five minutes of now. The signature header may carry several space-separated
 * "v1,<base64>" values.
 */
export function verifyWebhook(secrets: string[], headers: WebhookHeaders, body: string, now = Date.now()) {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (Math.abs(now / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const given = signature
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/,+$/, "").split(","))
    .filter(([version, sig]) => version === "v1" && !!sig)
    .map(([, sig]) => Buffer.from(sig));
  for (const secret of secrets) {
    if (!keyOf(secret)) continue;
    const expected = Buffer.from(signWebhook(secret, id, ts, body).slice(3));
    if (given.some((g) => g.length === expected.length && timingSafeEqual(g, expected))) return true;
  }
  return false;
}
