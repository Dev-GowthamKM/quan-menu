import Link from "next/link";
import type { Metadata } from "next";
import { AppearanceForm, CheckoutForm, ContentForm, EmailsForm, GeneralForm, HomepageForm, MaintenanceForm, RemindersForm, SeoForm } from "@/components/admin/store/SettingsForms";
import PaymentAccounts from "@/components/admin/store/PaymentAccounts";
import PhoneSignInSettings, { type PhoneSignInStatus } from "@/components/admin/store/PhoneSignInSettings";
import WhatsAppSettings from "@/components/admin/store/WhatsAppSettings";
import { PageHeader } from "@/components/admin/ui";
import { cx, Notice } from "@/components/ui/controls";
import { requireRole, requireStaffPage, roleAtLeast } from "@/lib/auth";
import { RAZORPAY_KEY_ID, SITE_URL } from "@/lib/env";
import { authProviderStatus, msg91Configured } from "@/lib/login-codes";
import { razorpayKeys } from "@/lib/payments/razorpay";
import { stripeConfigured } from "@/lib/payments/stripe";
import { EMAIL_FROM, RAZORPAY_KEY_SECRET, RESEND_API_KEY, SMS_HOOK_SECRET } from "@/lib/server-env";
import { secretsReady } from "@/lib/store-secrets";
import { whatsappConfigured, whatsappConnected } from "@/lib/whatsapp";
import { resolveDesign } from "@/lib/designs";
import { takenLooks } from "@/lib/look";

export const metadata: Metadata = { title: "Settings" };

const TABS = [
  { key: "general", label: "Store details" },
  { key: "appearance", label: "Appearance" },
  { key: "homepage", label: "Homepage" },
  { key: "checkout", label: "Checkout and tax" },
  { key: "payments", label: "Payment accounts" },
  { key: "content", label: "Policies and FAQ" },
  { key: "seo", label: "SEO" },
  { key: "emails", label: "Emails" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "signin", label: "Customer sign-in" },
  { key: "maintenance", label: "Maintenance and data" },
] as const;

/** Tabs for the platform's own accounts (WhatsApp, text messages): the home store's only, for now. */
const HOME_ONLY = new Set(["whatsapp", "signin"]);

/**
 * Saving re-opens a tab's form so it shows what was stored. These keep their state instead:
 * it already matches what was saved, and it holds a test number someone may be typing.
 */
const KEEP_STATE = new Set(["whatsapp", "signin"]);

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaffPage("admin");
  const { supabase, store, role } = await requireRole("admin");
  const { tab: raw } = await searchParams;
  const tabs = TABS.filter((t) => store.isHome || !HOME_ONLY.has(t.key));
  const tab = tabs.find((t) => t.key === raw)?.key ?? "general";
  const settingsQuery = supabase.from("store_settings").select("*");
  const [{ data: s, error }, samples, waiting, signin, keys, savedKeys, taken] = await Promise.all([
    (store.id ? settingsQuery.eq("store_id", store.id) : settingsQuery.eq("id", 1)).single(),
    tab === "maintenance" ? supabase.from("products").select("id", { count: "exact", head: true }).eq("is_sample", true) : Promise.resolve({ count: 0 }),
    tab === "emails" ? supabase.from("stock_alerts").select("id", { count: "exact", head: true }).is("notified_at", null) : Promise.resolve({ count: 0 }),
    tab === "signin" ? signinStatus() : Promise.resolve(null),
    tab === "checkout" || tab === "payments" ? razorpayKeys(store) : Promise.resolve(null),
    tab === "payments" && store.id ? supabase.rpc("store_secret_status") : Promise.resolve({ data: [] }),
    tab === "appearance" ? takenLooks(store.id) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Settings" description="Changes apply to the storefront as soon as they're saved." />
      {error || !s ? (
        <Notice tone="error">Settings couldn&apos;t load: {error?.message}</Notice>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="relative flex gap-1 overflow-x-auto lg:flex-col">
            {tabs.map((t) => (
              <Link key={t.key} href={`/admin/settings?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined}
                className={cx("rounded-md px-3 py-2 text-sm whitespace-nowrap", tab === t.key ? "bg-white font-medium shadow-sm ring-1 ring-black/10" : "text-taupe hover:bg-black/5 hover:text-ink")}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="min-w-0" key={KEEP_STATE.has(tab) ? tab : `${tab}-${s.updated_at}`}>
            {tab === "general" && <GeneralForm s={s} />}
            {tab === "appearance" && <AppearanceForm s={s} taken={taken} />}
            {tab === "homepage" && <HomepageForm s={s} design={resolveDesign(s.design, s.design_options)} />}
            {tab === "checkout" && <CheckoutForm s={s} razorpayReady={!!keys} stripeReady={stripeConfigured(store)} home={store.isHome} />}
            {tab === "payments" && (
              <PaymentAccounts
                saved={savedKeys.data ?? []}
                webhookUrl={`${SITE_URL}/api/webhooks/razorpay${store.id ? `?store=${store.id}` : ""}`}
                canEdit={roleAtLeast(role, "owner") && !!store.id}
                ready={secretsReady()}
                usingServerKeys={store.isHome && !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET)}
              />
            )}
            {tab === "content" && <ContentForm s={s} />}
            {tab === "seo" && <SeoForm s={s} />}
            {tab === "emails" && (
              <div className="grid gap-8">
                <RemindersForm s={s} waiting={waiting.count ?? 0} />
                <EmailsForm s={s} emailReady={!!(RESEND_API_KEY && EMAIL_FROM)} />
              </div>
            )}
            {tab === "whatsapp" && <WhatsAppSettings enabled={s.whatsapp_enabled} templates={(s.whatsapp_templates ?? {}) as never} connected={whatsappConfigured(store)} />}
            {tab === "signin" && signin && (
              <PhoneSignInSettings
                initial={{ enabled: s.phone_login_enabled, channel: s.phone_login_channel === "whatsapp" ? "whatsapp" : "sms", template: s.whatsapp_login_template, language: s.whatsapp_login_language }}
                status={signin}
                storeName={s.store_name}
              />
            )}
            {tab === "maintenance" && <MaintenanceForm s={s} sampleCount={samples.count ?? 0} />}
          </div>
        </div>
      )}
    </>
  );
}

async function signinStatus(): Promise<PhoneSignInStatus> {
  return {
    supabase: await authProviderStatus(true),
    hookSecret: !!SMS_HOOK_SECRET,
    msg91: msg91Configured(),
    whatsapp: whatsappConnected(),
    hookUrl: `${SITE_URL}/api/auth/sms`,
  };
}
