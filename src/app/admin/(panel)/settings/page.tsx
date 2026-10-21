import Link from "next/link";
import type { Metadata } from "next";
import { AppearanceForm, CheckoutForm, ContentForm, EmailsForm, GeneralForm, HomepageForm, MaintenanceForm, RemindersForm, SeoForm } from "@/components/admin/store/SettingsForms";
import WhatsAppSettings from "@/components/admin/store/WhatsAppSettings";
import { PageHeader } from "@/components/admin/ui";
import { cx, Notice } from "@/components/ui/controls";
import { requireRole, requireStaffPage } from "@/lib/auth";
import { razorpayConfigured } from "@/lib/payments/razorpay";
import { stripeConfigured } from "@/lib/payments/stripe";
import { EMAIL_FROM, RESEND_API_KEY } from "@/lib/server-env";
import { whatsappConfigured } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Settings" };

const TABS = [
  { key: "general", label: "Store details" },
  { key: "appearance", label: "Appearance" },
  { key: "homepage", label: "Homepage" },
  { key: "checkout", label: "Checkout and tax" },
  { key: "content", label: "Policies and FAQ" },
  { key: "seo", label: "SEO" },
  { key: "emails", label: "Emails" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "maintenance", label: "Maintenance and data" },
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaffPage("admin");
  const { supabase } = await requireRole("admin");
  const { tab: raw } = await searchParams;
  const tab = TABS.find((t) => t.key === raw)?.key ?? "general";
  const [{ data: s, error }, samples, waiting] = await Promise.all([
    supabase.from("store_settings").select("*").eq("id", 1).single(),
    tab === "maintenance" ? supabase.from("products").select("id", { count: "exact", head: true }).eq("is_sample", true) : Promise.resolve({ count: 0 }),
    tab === "emails" ? supabase.from("stock_alerts").select("id", { count: "exact", head: true }).is("notified_at", null) : Promise.resolve({ count: 0 }),
  ]);
  return (
    <>
      <PageHeader title="Settings" description="Changes apply to the storefront as soon as they're saved." />
      {error || !s ? (
        <Notice tone="error">Settings couldn&apos;t load: {error?.message}</Notice>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="relative flex gap-1 overflow-x-auto lg:flex-col">
            {TABS.map((t) => (
              <Link key={t.key} href={`/admin/settings?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined}
                className={cx("rounded-md px-3 py-2 text-sm whitespace-nowrap", tab === t.key ? "bg-white font-medium shadow-sm ring-1 ring-black/10" : "text-taupe hover:bg-black/5 hover:text-ink")}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="min-w-0" key={`${tab}-${s.updated_at}`}>
            {tab === "general" && <GeneralForm s={s} />}
            {tab === "appearance" && <AppearanceForm s={s} />}
            {tab === "homepage" && <HomepageForm s={s} />}
            {tab === "checkout" && <CheckoutForm s={s} razorpayReady={razorpayConfigured()} stripeReady={stripeConfigured()} />}
            {tab === "content" && <ContentForm s={s} />}
            {tab === "seo" && <SeoForm s={s} />}
            {tab === "emails" && (
              <div className="grid gap-8">
                <RemindersForm s={s} waiting={waiting.count ?? 0} />
                <EmailsForm s={s} emailReady={!!(RESEND_API_KEY && EMAIL_FROM)} />
              </div>
            )}
            {tab === "whatsapp" && <WhatsAppSettings enabled={s.whatsapp_enabled} templates={(s.whatsapp_templates ?? {}) as never} connected={whatsappConfigured()} />}
            {tab === "maintenance" && <MaintenanceForm s={s} sampleCount={samples.count ?? 0} />}
          </div>
        </div>
      )}
    </>
  );
}
