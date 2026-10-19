import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/store/auth/AuthForms";
import AuthShell from "@/components/store/auth/AuthShell";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/order-link";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const NOTICES: Record<string, string> = {
  link: "That link has expired or was already used. Sign in, or request a new link.",
  oauth: "Google sign-in didn't complete. Please try again.",
  wishlist: "Sign in to save pieces to your wishlist.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reason?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getUser()) redirect(next);
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to see your orders, wishlist and saved addresses.">
      <LoginForm next={next} notice={NOTICES[sp.error ?? ""] ?? NOTICES[sp.reason ?? ""] ?? null} />
    </AuthShell>
  );
}
