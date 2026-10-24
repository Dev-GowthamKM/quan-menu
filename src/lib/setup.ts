import "server-only";
import { razorpayKeys } from "./payments/razorpay";
import { schemaStatus, type SchemaStatus } from "./schema-status";
import { CRON_SECRET, EMAIL_FROM, RESEND_API_KEY } from "./server-env";
import { contactOf, getSettings, policiesOf } from "./settings";
import { storeOrigin, type StoreRef } from "./store";
import { secretsReady } from "./store-secrets";
import { supabaseServer } from "./supabase/server";
import { vercelDomainsReady } from "./vercel";

// Admin › Setup: what is done and what is left before a store is ready for customers,
// worked out afresh each time from the store's settings, catalog and the server's setup.

export type SetupState = "done" | "todo" | "optional" | "manual";

export interface SetupItem {
  key: string;
  title: string;
  detail: string;
  state: SetupState;
  href?: string;
  action?: string;
}

export interface SetupReport {
  /** For the platform's administrators (the main store's owners before the multi-store update). */
  database: SchemaStatus | null;
  store: SetupItem[];
  platform: SetupItem[] | null;
  /** Steps still to do (the database update counts as one). */
  todo: number;
}

const SAMPLE_TEXT = /Replace (this|these) sample/i;

/** Whether a store's own address answers with this site (it has been added in Vercel). */
async function answers(host: string) {
  try {
    const res = await fetch(`${storeOrigin({ host })}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(4000), redirect: "manual" });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { database?: string } | null;
    return !!body && "database" in body;
  } catch {
    return false;
  }
}

export async function setupReport(opts: { store: StoreRef; platform: boolean; checkAddress: boolean }): Promise<SetupReport> {
  const { store } = opts;
  const sb = await supabaseServer();
  const visible = () =>
    sb.from("products").select("id", { count: "exact", head: true }).eq("status", "active").lte("published_at", new Date().toISOString());
  const [settings, own, samples, keys, database] = await Promise.all([
    getSettings(store.id),
    visible().eq("is_sample", false),
    sb.from("products").select("id", { count: "exact", head: true }).eq("is_sample", true).neq("status", "archived"),
    razorpayKeys(store),
    opts.platform ? schemaStatus() : Promise.resolve(null),
  ]);
  const contact = contactOf(settings);
  const policies = policiesOf(settings);
  const policyText = [policies.shipping, policies.returns, policies.privacy, policies.terms];
  const sampleCount = samples.count ?? 0;

  const items: SetupItem[] = [
    {
      key: "contact",
      title: "Contact details",
      detail: contact.email && contact.email !== "care@example.com"
        ? `Customers can reach you at ${contact.email}.`
        : "Add the email (and phone) customers can reach you on. It's shown on the contact page and in emails.",
      state: contact.email && contact.email !== "care@example.com" ? "done" : "todo",
      href: "/admin/settings?tab=general",
      action: "Store details",
    },
    {
      key: "policies",
      title: "Shipping, returns, privacy and terms",
      detail: policyText.every((t) => t && !SAMPLE_TEXT.test(t))
        ? "All four policies are written."
        : "Replace the sample policies with your own (the pages still say they're samples).",
      state: policyText.every((t) => t && !SAMPLE_TEXT.test(t)) ? "done" : "todo",
      href: "/admin/settings?tab=content",
      action: "Policies and FAQ",
    },
    {
      key: "products",
      title: "Your own products on sale",
      detail: (own.count ?? 0) > 0
        ? `${own.count} of your products ${own.count === 1 ? "is" : "are"} on sale.`
        : "Add your first product and publish it. Until something is on sale, the home page says the store is opening soon.",
      state: (own.count ?? 0) > 0 ? "done" : "todo",
      href: "/admin/products/new",
      action: "Add a product",
    },
    {
      key: "samples",
      title: "Sample data removed",
      detail: sampleCount > 0
        ? `${sampleCount} sample product${sampleCount === 1 ? " is" : "s are"} still in the store. Remove them (with the sample brands, collections and codes) before you launch.`
        : "No sample products left.",
      state: sampleCount > 0 ? "todo" : "done",
      href: "/admin/settings?tab=maintenance",
      action: "Maintenance and data",
    },
    {
      key: "payments",
      title: "Online payments",
      detail: keys
        ? `Razorpay is connected (${keys.keyId.startsWith("rzp_live_") ? "live" : "test"} keys).`
        : "Save the store's Razorpay keys to take UPI, card and netbanking payments. Cash on delivery works meanwhile.",
      state: keys ? "done" : "todo",
      href: "/admin/settings?tab=payments",
      action: "Payment accounts",
    },
  ];

  if (!store.isHome) {
    const reachable = store.host && opts.checkAddress ? await answers(store.host) : null;
    items.push({
      key: "address",
      title: "Web address",
      detail: !store.host
        ? "The store has no web address yet, so customers can't reach it."
        : reachable === false
          ? `${store.host} doesn't open this store yet. Add it in Vercel › your project › Settings › Domains.`
          : `Customers visit ${store.host}.`,
      state: !store.host || reachable === false ? "todo" : "done",
      href: opts.platform && store.id ? `/admin/stores/${store.id}` : undefined,
      action: opts.platform ? "Web addresses" : undefined,
    });
  }

  const platform: SetupItem[] | null = opts.platform
    ? [
        {
          key: "email",
          title: "Order emails",
          detail: RESEND_API_KEY && EMAIL_FROM
            ? "Order confirmations and updates are sent through Resend."
            : "Set RESEND_API_KEY and EMAIL_FROM in Vercel (README › Email). Until then emails are recorded but not sent.",
          state: RESEND_API_KEY && EMAIL_FROM ? "done" : "todo",
        },
        {
          key: "cron",
          title: "Scheduled jobs",
          detail: CRON_SECRET
            ? "The daily job releases held stock, checks for missed payments and sends queued emails."
            : "Set CRON_SECRET in Vercel so the daily job can run.",
          state: CRON_SECRET ? "done" : "todo",
        },
        {
          key: "secrets",
          title: "Stores' payment keys",
          detail: secretsReady()
            ? "Each store's Razorpay keys are encrypted with STORE_SECRETS_KEY before they're saved."
            : "Set STORE_SECRETS_KEY in Vercel (32 random bytes, base64) so stores can save their Razorpay keys.",
          state: secretsReady() ? "done" : "todo",
        },
        {
          key: "vercel",
          title: "Web addresses added for you",
          detail: vercelDomainsReady()
            ? "New stores' addresses are added to the Vercel project automatically."
            : "Optional: save a Vercel token as VERCEL_API_TOKEN, and new stores' addresses are added to Vercel automatically.",
          state: vercelDomainsReady() ? "done" : "optional",
        },
        {
          key: "auth",
          title: "Sign-in emails for each store",
          detail:
            "Check in Supabase › Authentication: each store's address is in URL Configuration › Redirect URLs (https://address/**), and the email templates are the ones in supabase/templates/.",
          state: "manual",
        },
      ]
    : null;

  const todo = [...items, ...(platform ?? [])].filter((i) => i.state === "todo").length + (database?.pending.length ? 1 : 0);
  return { database, store: items, platform, todo };
}
