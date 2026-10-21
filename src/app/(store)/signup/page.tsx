import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/store/auth/AuthForms";
import AuthShell from "@/components/store/auth/AuthShell";
import { getUser } from "@/lib/auth";
import { phoneSignInChannel } from "@/lib/login-codes";
import { safeNext } from "@/lib/order-link";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const [user, settings] = await Promise.all([getUser(), getSettings()]);
  if (user) redirect(next);
  return (
    <AuthShell title="Create an account" subtitle="Track orders, save addresses and keep a wishlist.">
      <SignupForm next={next} phone={phoneSignInChannel(settings)} />
    </AuthShell>
  );
}
