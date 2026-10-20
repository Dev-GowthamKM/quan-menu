import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CheckoutForm from "@/components/store/checkout/CheckoutForm";
import { getUser } from "@/lib/auth";
import { razorpayConfigured } from "@/lib/payments/razorpay";
import { stripeConfigured } from "@/lib/payments/stripe";
import { getSettings } from "@/lib/settings";
import { whatsappConfigured } from "@/lib/whatsapp";
import { supabaseServer } from "@/lib/supabase/server";
import { getCart } from "@/server/cart";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const [user, quote, settings] = await Promise.all([getUser(), getCart(), getSettings()]);
  if (!quote.line_count) redirect("/cart");

  let addresses: Awaited<ReturnType<typeof loadAddresses>> = [];
  let profile = { full_name: "", phone: "" };
  if (user) {
    const sb = await supabaseServer();
    addresses = await loadAddresses();
    const { data } = await sb.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
    profile = data ?? profile;
  }

  return (
    <CheckoutForm
      initialQuote={quote}
      user={user ? { email: user.email ?? "", name: profile.full_name, phone: profile.phone } : null}
      addresses={addresses}
      config={{
        storeName: settings.store_name,
        razorpay: settings.razorpay_enabled && razorpayConfigured(),
        stripe: settings.stripe_enabled && stripeConfigured(),
        reservationMinutes: settings.reservation_minutes,
        whatsapp: settings.whatsapp_enabled && whatsappConfigured(),
      }}
    />
  );
}

async function loadAddresses() {
  const sb = await supabaseServer();
  const { data } = await sb.from("customer_addresses").select("*").order("is_default", { ascending: false }).order("created_at");
  return data ?? [];
}
